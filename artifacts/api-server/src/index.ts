import express from "express";
import path from "path";
import fs from "fs";
import crypto from "crypto";
import cors from "cors";
import helmet from "helmet";
import morgan from "morgan";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { PrismaClient } from "@prisma/client";
import { createServer } from "http";
import { Server } from "socket.io";
import { closeShiftSafely, lockBranch, openShiftSafely, ShiftConflict } from "./shift-safety";
import { registerOwnerDashboardRoutes } from "./owner-dashboard";
import { registerBranchReadRoutes } from "./read-routes";
import { applyOpname, OpnameConflict } from "./opname";
import { applyStockDelta, InsufficientAdjustmentStock } from "./stock-adjustment";
import { validateDatabaseTarget } from "./database-target";
import { createReadiness, inspectDatabase, prepareDatabase } from "./database-readiness";
import { getLogicalShiftDate } from "./business-date";

// Validate before constructing Prisma. Never log connection-string errors.
let databaseTarget: ReturnType<typeof validateDatabaseTarget>;
try { databaseTarget = validateDatabaseTarget(process.env); }
catch {
  console.error("API startup refused: invalid database target/environment configuration. See STARTUP-SAFETY.md.");
  process.exit(1);
}
const prisma = new PrismaClient();
const readiness = createReadiness(() => inspectDatabase(prisma, databaseTarget));
const app = express();
const httpServer = createServer(app);
const io = new Server(httpServer, {
  cors: {
    origin: "*",
  }
});

// Idempotency cache: prevents duplicate sales when the client retries due to
// network instability. Key = X-Idempotency-Key header (UUID from client).
// Entries expire after 90 seconds — long enough to cover any realistic retry window.
const idempotencyCache = new Map<string, { result: any; expires: number }>();
setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of idempotencyCache) {
    if (entry.expires <= now) idempotencyCache.delete(key);
  }
}, 30_000);

// Emit an event to the given branch's room plus the global (admin/audit) room.
// When branchId is missing we fall back to a global broadcast so nothing is lost.
function emitBranch(branchId: string | null | undefined, event: string, payload: any) {
  if (branchId) {
    io.to("global").to(`branch:${branchId}`).emit(event, payload);
  } else {
    io.emit(event, payload);
  }
}

const PORT = Number(process.env.PORT) || 8080;

// Resolve the JWT signing secret WITHOUT a hardcoded fallback.
// Priority: JWT_SECRET env var -> persisted local secret file -> freshly generated
// random secret (persisted so tokens survive restarts). This removes the previously
// hardcoded/known secret while keeping logins working on a fresh local install.
function resolveJwtSecret(): string {
  if (process.env.JWT_SECRET && process.env.JWT_SECRET.trim()) {
    return process.env.JWT_SECRET.trim();
  }
  const secretPath = path.join(process.cwd(), ".jwt-secret");
  try {
    const existing = fs.readFileSync(secretPath, "utf8").trim();
    if (existing) return existing;
  } catch {}
  const generated = crypto.randomBytes(48).toString("hex");
  try {
    fs.writeFileSync(secretPath, generated, { mode: 0o600 });
    console.log("🔐 Generated a new JWT secret (stored in .jwt-secret). Set the JWT_SECRET env var to override.");
  } catch (e: any) {
    console.warn("⚠️ Could not persist JWT secret to disk; tokens will reset on restart. Set JWT_SECRET env to fix:", e?.message);
  }
  return generated;
}

const JWT_SECRET = resolveJwtSecret();

// Real-time scoping with VERIFIED identity. Room membership must NOT trust
// client-sent role/branch (a client could spoof role:"ADMIN" to read every branch).
// Instead we authenticate the socket handshake with the same signed JWT used for the
// REST API and derive rooms from the trusted token claims only. Admins/Audit join
// "global" (all branches); a cashier joins only their own "branch:<id>" room.
io.use((socket, next) => {
  const token = socket.handshake.auth?.token;
  if (!token) return next(new Error("Unauthorized"));
  jwt.verify(token, JWT_SECRET, (err: any, user: any) => {
    if (err) return next(new Error("Invalid or expired token"));
    socket.data.user = user;
    next();
  });
});

io.on("connection", (socket) => {
  const user = (socket.data.user || {}) as { role?: string; branchId?: string };
  if (user.role === "ADMIN" || user.role === "AUDIT") {
    socket.join("global");
  } else if (user.branchId) {
    socket.join(`branch:${user.branchId}`);
  }
});

app.use(cors());
app.use(helmet({
  contentSecurityPolicy: false, // Disable for easier dev/preview
}));
app.use(morgan("dev"));
app.use(express.json());

app.get("/api/healthz", readiness.health);
app.get("/api/health", readiness.health);
app.use("/api", readiness.gate);

// Middleware for token validation
const authenticateToken = (req: any, res: any, next: any) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) return res.status(401).json({ error: "Unauthorized access" });

  jwt.verify(token, JWT_SECRET, (err: any, user: any) => {
    if (err) return res.status(403).json({ error: "Invalid or expired token" });
    req.user = user;
    next();
  });
};

// Role-based authorization. Roles (from the verified JWT claims only — never the
// request body): ADMIN = owner, full access. AUDIT = stock operations on ANY branch
// (opname/adjust/destroy, transfer, voucher batch) plus read access, but NOT product,
// branch, user, config management, refunds, or commission withdrawal. CASHIER = create
// sales, add/transfer stock, and refund — all restricted to their OWN branch (enforced
// inside each handler). Use this to gate routes by allowed roles.
const requireRole = (...roles: string[]) => (req: any, res: any, next: any) => {
  if (!req.user || !roles.includes(req.user.role)) {
    return res.status(403).json({ error: "Forbidden: tidak memiliki izin untuk aksi ini." });
  }
  next();
};

// Remove the bcrypt password hash from a (possibly nested) user object before it is
// returned to clients. Endpoints that `include: { cashier: true }` would otherwise leak
// the hash of every cashier to any authenticated user.
const stripPw = (u: any) => {
  if (!u) return u;
  const { password, ...rest } = u;
  return rest;
};

// --- Input validation helpers -------------------------------------------------
// Coerce to a finite number; returns null for missing / NaN / Infinity so callers
// can reject bad input instead of writing corrupt values (NaN totals, etc.) to the DB.
const toFiniteNumber = (v: any): number | null => {
  if (v === null || v === undefined || v === "") return null;
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : null;
};
// Coerce to a strictly-positive integer (for qty). Returns null when invalid.
const toPositiveInt = (v: any): number | null => {
  const n = toFiniteNumber(v);
  if (n === null || !Number.isInteger(n) || n <= 0) return null;
  return n;
};
// Coerce to a number >= 0 (for money fields). Returns null when invalid.
const toNonNegativeNumber = (v: any): number | null => {
  const n = toFiniteNumber(v);
  if (n === null || n < 0) return null;
  return n;
};

// API Routes
// Authentication API
app.post("/api/auth/register", authenticateToken, async (req, res) => {
  if ((req as any).user.role !== "ADMIN") return res.status(403).json({ error: "Forbidden" });
  const { username, password, name, role, branchId, alternativeNames } = req.body;
  const cleanUsername = username?.trim().toLowerCase();
  const cleanPassword = password?.trim();
  
  if (!cleanUsername || !cleanPassword) {
    return res.status(400).json({ error: "Username dan password wajib diisi." });
  }

  try {
    const hashedPassword = await bcrypt.hash(cleanPassword, 10);
    const user = await prisma.user.create({
      data: {
        username: cleanUsername,
        password: hashedPassword,
        name,
        alternativeNames,
        role: role || "CASHIER",
        branchId,
        status: "Active"
      }
    });
    const { password: _, ...userWithoutPassword } = user;
    res.json(userWithoutPassword);
  } catch (error: any) {
    console.error("Register Error:", error);
    res.status(500).json({ error: error?.message || "Username already exists or invalid data" });
  }
});

app.post("/api/auth/login", async (req, res) => {
  const { username, password } = req.body;
  const cleanUsername = username?.trim().toLowerCase();
  const cleanPassword = password?.trim();
  
  if (!cleanUsername || !cleanPassword) {
    return res.status(400).json({ error: "Username and password are required" });
  }

  try {
    const user = await prisma.user.findUnique({
      where: { username: cleanUsername }
    });

    if (!user) {
      console.log(`❌ Login failed: User "${cleanUsername}" not found.`);
      return res.status(401).json({ error: "User not found" });
    }

    // Security: passwords must match the bcrypt hash. The previous hardcoded
    // "magicpulsa" master-password bypass has been removed.
    const isMatch = await bcrypt.compare(cleanPassword, user.password);

    if (!isMatch) {
      console.log(`❌ Login failed: Invalid password for user "${cleanUsername}".`);
      return res.status(401).json({ error: "Invalid password" });
    }

    console.log(`✅ Login successful: User "${cleanUsername}" logged in.`);
    const token = jwt.sign(
      { userId: user.id, username: user.username, role: user.role, branchId: user.branchId },
      JWT_SECRET,
      { expiresIn: "7d" }
    );

    const { password: _, ...userWithoutPassword } = user;
    res.json({ user: userWithoutPassword, token });
  } catch (error) {
    console.error("Login Error:", error);
    res.status(500).json({ error: "Authentication failed. Server Error: " + (error as any).message });
  }
});

// Google / Firebase login removed: the app now runs fully on local storage with
// username + password authentication (see /api/auth/login). This keeps the app
// self-contained for on-premise (local server) deployment with no cloud dependency.

app.get("/api/auth/me", authenticateToken, async (req, res) => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: (req as any).user.userId }
    });
    if (!user) return res.status(404).json({ error: "User not found" });

    const { password: _, ...userWithoutPassword } = user;
    res.json(userWithoutPassword);
  } catch (error) {
    res.status(500).json({ error: "Internal server error" });
  }
});

// Protected API Routes
app.post("/api/products", authenticateToken, requireRole("ADMIN"), async (req, res) => {
  const { id, purchasePrice, ...data } = req.body;
  if (purchasePrice !== undefined) {
    (data as any).buyingPrice = purchasePrice;
  }
  // Guard money fields so a bad value can't be persisted (NaN/negative prices).
  for (const f of ["sellingPrice", "discountPrice", "commissionAmount", "buyingPrice"]) {
    const val = (data as any)[f];
    if (val !== undefined && val !== null && val !== "" && toNonNegativeNumber(val) === null) {
      return res.status(400).json({ error: `Nilai ${f} harus angka >= 0.` });
    }
  }
  // Normalize expiredAt: input type="date" sends "YYYY-MM-DD" but Prisma DateTime needs ISO string.
  if ((data as any).expiredAt) {
    const raw = (data as any).expiredAt as string;
    // If it's already a full ISO string leave it; if it's just a date ("YYYY-MM-DD") append time.
    (data as any).expiredAt = raw.includes("T") ? new Date(raw) : new Date(raw + "T00:00:00.000Z");
  } else {
    (data as any).expiredAt = null;
  }
  try {
    const product = id 
      ? await prisma.product.update({ where: { id }, data })
      : await prisma.product.create({ data: data as any });
    
    // Broadcast product change
    io.emit("productUpdated", product);
    
    res.json(product);
  } catch (error) {
    console.error("Save Product Error:", error);
    res.status(500).json({ error: "Failed to save product" });
  }
});

app.delete("/api/products/:id", authenticateToken, requireRole("ADMIN"), async (req, res) => {
  const productId = req.params.id;
  try {
    // Soft delete: ARCHIVE the product instead of removing it. This keeps every related
    // record intact — sales history, bonus (Commission) rows, and owner income — so
    // nothing is lost when a product is "deleted". GET /api/products only returns status
    // "ACTIVE", so the archived product disappears from the catalog and POS, while reports
    // still resolve its name through the preserved product relation.
    await prisma.product.update({
      where: { id: productId },
      data: { status: "ARCHIVED" }
    });

    io.emit("productDeleted", { id: productId });
    res.json({ success: true });
  } catch (error: any) {
    console.error("Archive Product Error:", error);
    res.status(500).json({ error: "Gagal mengarsipkan produk: " + (error.message || "Coba lagi.") });
  }
});

app.post("/api/branches", authenticateToken, requireRole("ADMIN"), async (req, res) => {
  const { name, address, phone, allowEmployeeInput } = req.body;
  try {
    const branch = await prisma.branch.create({
      data: { name, address, phone, allowEmployeeInput: allowEmployeeInput ?? true }
    });
    res.json(branch);
  } catch (error) {
    res.status(500).json({ error: "Failed to create branch" });
  }
});

app.patch("/api/branches/:id", authenticateToken, requireRole("ADMIN"), async (req, res) => {
  const { name, address, phone, allowEmployeeInput } = req.body;
  try {
    const branch = await prisma.branch.update({
      where: { id: req.params.id },
      data: { name, address, phone, allowEmployeeInput }
    });
    res.json(branch);
  } catch (error) {
    res.status(500).json({ error: "Failed to update branch" });
  }
});

app.delete("/api/branches/:id", authenticateToken, async (req, res) => {
  if ((req as any).user.role !== "ADMIN") return res.status(403).json({ error: "Forbidden" });
  const branchId = req.params.id;
  try {
    // Check if branch has any transactions to prevent deleting active branches
    const salesCount = await prisma.sale.count({ where: { branchId } });
    const shiftsCount = await prisma.shift.count({ where: { branchId } });
    const adjustmentsCount = await prisma.adjustment.count({ where: { branchId } });
    // Bonus must never be destroyed by deleting a branch. After old sales are archived,
    // commissions stay (saleId = null) but keep their branchId, so check them explicitly
    // — otherwise an archived branch could pass the guard above and lose bonus history.
    const commissionsCount = await prisma.commission.count({ where: { branchId } });

    if (salesCount > 0 || shiftsCount > 0 || adjustmentsCount > 0 || commissionsCount > 0) {
      return res.status(400).json({ 
        error: "Cabang tidak dapat dihapus karena masih memiliki riwayat operasional atau bonus (penjualan, shift, adjustment, atau komisi)." 
      });
    }

    await prisma.$transaction(async (tx) => {
      // Cleanup all transaction data for this branch (Uji Coba Mode)
      // Delete in order to satisfy FK constraints
      
      // 1. Delete associated SaleItems and Commissions
      const sales = await tx.sale.findMany({ where: { branchId }, select: { id: true } });
      const saleIds = sales.map(s => s.id);
      
      if (saleIds.length > 0) {
        await tx.saleItem.deleteMany({ where: { saleId: { in: saleIds } } });
        await tx.commission.deleteMany({ where: { saleId: { in: saleIds } } });
        await tx.sale.deleteMany({ where: { id: { in: saleIds } } });
      }

      // 2. Delete Shifts and StockSnapshots
      const shifts = await tx.shift.findMany({ where: { branchId }, select: { id: true } });
      const shiftIds = shifts.map(s => s.id);
      
      if (shiftIds.length > 0) {
        await tx.stockSnapshot.deleteMany({ where: { shiftId: { in: shiftIds } } });
        await tx.shift.deleteMany({ where: { id: { in: shiftIds } } });
      } else {
        // Just in case there are orphaned snapshots
        await tx.stockSnapshot.deleteMany({ where: { branchId } });
      }

      // 3. Cleanup branch-specific master data
      await tx.productStock.deleteMany({ where: { branchId } });
      await tx.voucherSN.deleteMany({ where: { branchId } });
      await tx.adjustment.deleteMany({ where: { branchId } });
      
      // 4. Update users in this branch to have no branch
      await tx.user.updateMany({
        where: { branchId },
        data: { branchId: null }
      });

      // 5. Delete the branch
      await tx.branch.delete({ where: { id: branchId } });
    });
    res.json({ success: true });
  } catch (error: any) {
    console.error("Delete Branch Error:", error);
    res.status(500).json({ error: "Gagal menghapus cabang: " + error.message });
  }
});

app.get("/api/config", authenticateToken, async (req, res) => {
  try {
    const config = await prisma.globalConfig.upsert({
      where: { id: "default" },
      update: {},
      create: { id: "default", allowCashierStockInput: true }
    });
    res.json(config);
  } catch (error) {
    res.status(500).json({ error: "Failed to fetch config" });
  }
});

app.patch("/api/config", authenticateToken, async (req, res) => {
  if ((req as any).user.role !== "ADMIN") return res.status(403).json({ error: "Forbidden" });
  const { allowCashierStockInput } = req.body;
  try {
    const config = await prisma.globalConfig.update({
      where: { id: "default" },
      data: { allowCashierStockInput }
    });
    res.json(config);
  } catch (error) {
    res.status(500).json({ error: "Failed to update config" });
  }
});

app.post("/api/transactions", authenticateToken, requireRole("ADMIN", "CASHIER"), async (req, res) => {
  // Idempotency guard: if the client sends the same key twice (network retry),
  // return the cached result immediately without touching the DB again.
  const idempKey = (req.headers["x-idempotency-key"] as string | undefined)?.trim();
  if (idempKey) {
    const cached = idempotencyCache.get(idempKey);
    if (cached && cached.expires > Date.now()) {
      console.log(`↩️  Idempotency hit for key ${idempKey} — returning cached sale`);
      return res.json(cached.result);
    }
  }

  const { branchId, cashierId, items, customerName, total, totalCommission } = req.body;
  const requester = (req as any).user;
  // Cashiers are locked to their own branch and identity: a cashier can never post a
  // sale for another branch or attribute it to another cashier, regardless of body.
  const actualCashierId = requester.role === "CASHIER" ? requester.userId : (cashierId || requester.userId);
  const actualBranchId = requester.role === "CASHIER" ? requester.branchId : (branchId || requester.branchId);
  if (!actualBranchId) return res.status(400).json({ error: "Cabang tidak ditentukan untuk transaksi ini." });

  // Validate payload before touching the DB so a malformed request can never write
  // NaN/negative totals or iterate over a non-array (which would crash or corrupt data).
  if (!Array.isArray(items) || items.length === 0) {
    return res.status(400).json({ error: "Item transaksi tidak valid atau kosong." });
  }
  for (const it of items) {
    if (!it || !it.productId) return res.status(400).json({ error: "Item transaksi tidak valid (produk tidak ada)." });
    if (toPositiveInt(it.qty) === null) return res.status(400).json({ error: "Jumlah (qty) setiap item harus bilangan bulat positif." });
    if (toFiniteNumber(it.price) === null) return res.status(400).json({ error: "Harga item tidak valid." });
  }
  const safeTotal = toFiniteNumber(total);
  if (safeTotal === null) return res.status(400).json({ error: "Total transaksi tidak valid." });
  const safeCommission = toFiniteNumber(totalCommission) ?? 0;
  // Normalize numeric fields up-front so downstream math and Prisma int columns always
  // receive real numbers (a legitimate "2" string is accepted, not rejected at the DB layer).
  const normItems = items.map((it: any) => ({
    productId: it.productId,
    qty: toPositiveInt(it.qty) as number,
    price: toFiniteNumber(it.price) as number,
    commission: toFiniteNumber(it.commission) ?? 0,
    subtotal: toFiniteNumber(it.subtotal) ?? ((toFiniteNumber(it.price) as number) * (toPositiveInt(it.qty) as number)),
    sn: it.sn,
  }));

  try {
    const result = await prisma.$transaction(async (tx) => {
      await lockBranch(tx, actualBranchId);
      // A cashier sale must belong to a persisted, currently open shift for this
      // verified branch/account. Sharing the branch lock with open/close keeps the
      // check atomic against a shift being closed concurrently. Do not apply this
      // cashier-specific rule to ADMIN requests.
      if (requester.role === "CASHIER") {
        const activeShift = await tx.shift.findFirst({
          where: {
            branchId: actualBranchId,
            cashierId: actualCashierId,
            status: "open",
          },
          select: { id: true },
        });
        if (!activeShift) {
          throw new ShiftConflict("Shift kasir belum dibuka atau sudah ditutup. Buka shift sebelum bertransaksi.");
        }
      }

      let finalTotalProfit = 0;
      const saleItemsData = [];
      const productNames: Record<string, string> = {};

      // 1. Validate All Stocks and Collect Cost Prices First
      for (const item of normItems) {
        const product = await tx.product.findUnique({
          where: { id: item.productId },
          include: { stocks: { where: { branchId: actualBranchId } } }
        });

        if (!product) throw new Error(`Produk dengan ID ${item.productId} tidak ditemukan.`);
        
        productNames[item.productId] = product.name;

        const currentStock = product.stocks[0]?.qty || 0;
        if (currentStock < item.qty) {
          throw new Error(`Stok tidak cukup untuk ${product.name}. Tersedia: ${currentStock}, Diminta: ${item.qty}`);
        }

        const costPrice = Number(product.buyingPrice || 0);
        const itemProfit = (item.price * item.qty) - (costPrice * item.qty) - (item.commission || 0);
        finalTotalProfit += itemProfit;

        saleItemsData.push({
          productId: item.productId,
          qty: item.qty,
          price: item.price,
          costPrice: costPrice,
          subtotal: item.subtotal,
          sn: item.sn || product.masterSN || null
        });
      }

      // 2. Create the Sale
      const sale = await tx.sale.create({
        data: {
          branchId: actualBranchId,
          cashierId: actualCashierId,
          customerName,
          total: safeTotal,
          totalCommission: safeCommission,
          totalProfit: finalTotalProfit,
          status: "success",
          items: {
            create: saleItemsData
          }
        },
        include: { items: true }
      });

      // 3. Update Stocks & Commissions
      for (const item of saleItemsData) {
        // Atomic guard against overselling: only decrement when enough stock still
        // exists at this exact moment. If two cashiers sell the last unit at the same
        // time, the second UPDATE matches 0 rows and we abort instead of going negative.
        const decremented = await tx.productStock.updateMany({
          where: {
            productId: item.productId,
            branchId: actualBranchId,
            qty: { gte: item.qty }
          },
          data: {
            qty: { decrement: item.qty }
          }
        });
        if (decremented.count === 0) {
          throw new Error(`Stok tidak cukup untuk ${productNames[item.productId] || item.productId}. Stok mungkin baru saja terjual.`);
        }

        if (item.productId && (normItems.find((i) => i.productId === item.productId)?.commission || 0) > 0) {
          const commAmt = normItems.find((i) => i.productId === item.productId)!.commission;
          await tx.commission.create({
            data: {
              saleId: sale.id,
              productId: item.productId,
              qty: item.qty,
              amount: commAmt,
              cashierId: actualCashierId,
              branchId: actualBranchId,
              status: "earned",
              sn: item.sn
            }
          });
        }
      }

      // Bonus is tracked solely through the Commission ledger (status "earned"); the
      // per-branch claimable balance is derived from it, so there is no separate counter
      // to keep in sync.

      return sale;
    });

    // CRITICAL: Emit real-time stock update notification (scoped to this branch + admins)
    emitBranch(actualBranchId, "saleProcessed", {
      saleId: result.id,
      items: normItems.map((i) => ({ productId: i.productId, branchId: actualBranchId, qty: i.qty }))
    });

    // Store result in idempotency cache so a network-retry from the same client
    // returns the same sale without re-processing (no duplicate stock decrement).
    if (idempKey) {
      idempotencyCache.set(idempKey, { result, expires: Date.now() + 90_000 });
    }

    res.json(result);
  } catch (error: any) {
    if (error instanceof ShiftConflict) {
      return res.status(error.status).json({ error: error.message });
    }
    console.error("Sale Process Error:", error);
    res.status(400).json({ error: error.message || "Gagal memproses penjualan" });
  }
});

app.get("/api/transactions", authenticateToken, async (req, res) => {
  const { branchId, startDate, endDate } = req.query;
  const requester = (req as any).user;
  try {
    const where: any = {};
    // CASHIER reads are locked to their own branch; client-supplied branchId is ignored.
    // ADMIN/AUDIT may read any/all branches.
    if (requester.role === "CASHIER") where.branchId = requester.branchId;
    else if (branchId) where.branchId = branchId as string;
    
    if (startDate || endDate) {
      where.createdAt = {};
      if (startDate && startDate !== "undefined" && startDate !== "null") {
        const d = new Date(startDate as string);
        if (!isNaN(d.getTime())) where.createdAt.gte = d;
      }
      if (endDate && endDate !== "undefined" && endDate !== "null") {
        const d = new Date(endDate as string);
        if (!isNaN(d.getTime())) where.createdAt.lte = d;
      }
      // Cleanup if no valid dates were added
      if (Object.keys(where.createdAt).length === 0) delete where.createdAt;
    }

    const sales = await prisma.sale.findMany({
      where,
      include: { 
        items: { 
          include: { 
            product: true 
          } 
        }, 
        cashier: true, 
        branch: true 
      },
      orderBy: { createdAt: "desc" }
    });
    res.json(sales.map((s: any) => ({ ...s, cashier: stripPw(s.cashier) })));
  } catch (error: any) {
    console.error("Fetch Sales Error [Full]:", {
      code: error.code,
      meta: error.meta,
      message: error.message,
      stack: error.stack,
      query: { branchId, startDate, endDate }
    });
    res.status(500).json({ 
      error: "Failed to fetch sales", 
      details: error?.message,
      code: error?.code 
    });
  }
});

app.get("/api/incentives", authenticateToken, async (req, res) => {
  const { cashierId, branchId } = req.query;
  const requester = (req as any).user;
  try {
    const where: any = {};
    if (cashierId) where.cashierId = cashierId as string;
    // CASHIER reads are locked to their own branch; client-supplied branchId is ignored.
    if (requester.role === "CASHIER") where.branchId = requester.branchId;
    else if (branchId) where.branchId = branchId as string;
    const commissions = await prisma.commission.findMany({
      where,
      include: { product: true, cashier: true, branch: true, sale: true },
      orderBy: { createdAt: "desc" }
    });
    res.json(commissions.map((c: any) => ({ ...c, cashier: stripPw(c.cashier) })));
  } catch (error) {
    console.error("Commissions Fetch Error:", error);
    res.status(500).json({ error: "Failed to fetch commissions" });
  }
});

app.get("/api/shifts", authenticateToken, async (req, res) => {
  const { branchId, status } = req.query;
  const requester = (req as any).user;
  try {
    const where: any = {};
    // CASHIER reads are locked to their own branch; client-supplied branchId is ignored.
    if (requester.role === "CASHIER") where.branchId = requester.branchId;
    else if (branchId) where.branchId = branchId as string;
    if (status) where.status = status as string;
    const shifts = await prisma.shift.findMany({
      where,
      include: { cashier: true, branch: true },
      orderBy: { openTime: "desc" }
    });
    res.json(shifts.map((s: any) => ({ ...s, cashier: stripPw(s.cashier) })));
  } catch (error) {
    res.status(500).json({ error: "Failed to fetch shifts" });
  }
});

app.post("/api/shifts", authenticateToken, requireRole("ADMIN", "CASHIER"), async (req, res) => {
  const { branchId, cashierId, initialCash, shiftDate, shiftType } = req.body;
  const requester = (req as any).user;
  // Cashiers may only open shifts for their own branch and under their own identity.
  const shiftBranchId = requester.role === "CASHIER" ? requester.branchId : branchId;
  const shiftCashierId = requester.role === "CASHIER" ? requester.userId : cashierId;
  if (!shiftBranchId) return res.status(400).json({ error: "Cabang shift tidak ditentukan." });
  const safeInitialCash = toNonNegativeNumber(initialCash);
  if (safeInitialCash === null) return res.status(400).json({ error: "Modal awal (initialCash) harus angka >= 0." });
  if (typeof shiftType !== "string" || !shiftType.trim() || typeof shiftDate !== "string" ||
      !/^\d{4}-\d{2}-\d{2}$/.test(shiftDate) || !shiftCashierId) {
    return res.status(400).json({ error: "Identitas dan tanggal shift wajib diisi." });
  }
  try {
    const shift = await openShiftSafely(prisma, {
      branchId: shiftBranchId, cashierId: shiftCashierId, initialCash: safeInitialCash,
      shiftDate, shiftType,
    });
    res.json(shift);
  } catch (error) {
    if (error instanceof ShiftConflict) return res.status(error.status).json({ error: error.message });
    res.status(500).json({ error: "Failed to open shift" });
  }
});

app.patch("/api/shifts/:id", authenticateToken, requireRole("ADMIN", "CASHIER"), async (req, res) => {
  const { actualCash, status } = req.body;
  const requester = (req as any).user;
  // Reopening needs retained correction history, not an arbitrary status patch.
  if (status !== "closed") return res.status(400).json({ error: "Gunakan proses penutupan shift yang valid." });
  const safeCash = actualCash === undefined ? undefined : toFiniteNumber(actualCash);
  if (safeCash === null) return res.status(400).json({ error: "Nilai actualCash tidak valid." });

  try {
    const existing = await prisma.shift.findUnique({
      where: { id: req.params.id },
      select: { branchId: true, openTime: true, initialCash: true }
    });
    if (!existing) return res.status(404).json({ error: "Shift tidak ditemukan." });

    if (requester.role === "CASHIER" && existing.branchId !== requester.branchId) {
      return res.status(403).json({ error: "Kasir hanya dapat mengubah shift cabangnya sendiri." });
    }

    const shift = await closeShiftSafely(prisma, req.params.id, existing.branchId, safeCash);
    res.json(shift);
  } catch (error) {
    if (error instanceof ShiftConflict) return res.status(error.status).json({ error: error.message });
    res.status(500).json({ error: "Failed to update shift" });
  }
});

app.delete("/api/shifts/:id", authenticateToken, requireRole("ADMIN"), async (req, res) => {
  try {
    await prisma.shift.delete({ where: { id: req.params.id } });
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: "Failed to delete shift" });
  }
});

app.get("/api/adjustments", authenticateToken, async (req, res) => {
  const requester = (req as any).user;
  try {
    // CASHIER reads are locked to their own branch; ADMIN/AUDIT see all branches.
    const where: any = requester.role === "CASHIER" ? { branchId: requester.branchId } : {};
    const adjustments = await prisma.adjustment.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take: 200, 
    });
    res.json(adjustments);
  } catch (error) {
    res.status(500).json({ error: "Failed to fetch adjustments" });
  }
});

app.post("/api/stocks/adjust", authenticateToken, requireRole("ADMIN", "AUDIT", "CASHIER"), async (req, res) => {
  const { productId, branchId, qty, type, reason, oldQty, newQty } = req.body;
  const requester = (req as any).user;
  // Cashiers may only ADD stock to their own branch. Opname (setting newQty) and
  // removal/destruction (STOCK_OUT / negative qty) are reserved for AUDIT/ADMIN.
  if (requester.role === "CASHIER") {
    if (branchId !== requester.branchId) {
      return res.status(403).json({ error: "Kasir hanya dapat mengubah stok cabangnya sendiri." });
    }
    if (newQty !== undefined || (type && type !== "STOCK_IN") || (qty !== undefined && qty <= 0)) {
      return res.status(403).json({ error: "Kasir hanya dapat menambah stok, bukan opname atau pengurangan/pemusnahan." });
    }
  }
  if (!productId || !branchId) return res.status(400).json({ error: "Produk atau cabang tidak ditentukan." });
  const hasNewQty = newQty !== undefined && newQty !== null;
  const safeNewQty = hasNewQty ? toFiniteNumber(newQty) : null;
  const safeQty = (qty !== undefined && qty !== null) ? toFiniteNumber(qty) : null;
  if (hasNewQty) {
    if (safeNewQty === null || !Number.isInteger(safeNewQty) || safeNewQty < 0) {
      return res.status(400).json({ error: "Nilai opname (newQty) harus bilangan bulat >= 0." });
    }
  } else if (safeQty === null || !Number.isInteger(safeQty) || safeQty === 0) {
    return res.status(400).json({ error: "Jumlah penyesuaian (qty) harus bilangan bulat bukan nol." });
  }
  const safeOldQty = toFiniteNumber(oldQty) ?? 0;
  if (hasNewQty && (
    oldQty === undefined || oldQty === null ||
    toFiniteNumber(oldQty) === null || !Number.isInteger(safeOldQty)
  )) {
    return res.status(400).json({ error: "Stok awal opname (oldQty) harus bilangan bulat." });
  }
  try {
    const result = await prisma.$transaction(async (tx) => {
      if (requester.role === "CASHIER") {
        await lockBranch(tx, requester.branchId);
        const activeShift = await tx.shift.findFirst({
          where: {
            branchId: requester.branchId,
            cashierId: requester.userId,
            status: "open",
          },
          select: { id: true },
        });
        if (!activeShift) {
          throw new ShiftConflict("Shift kasir belum dibuka atau sudah ditutup. Input stok tidak dapat diproses.");
        }
      }

      if (hasNewQty) {
        return applyOpname(tx, {
          productId, branchId, oldQty: safeOldQty,
          newQty: safeNewQty as number, reason,
        });
      }
      const stock = await applyStockDelta(tx, productId, branchId, safeQty as number);

      // Add Adjustment Record
      await tx.adjustment.create({
        data: {
          productId,
          branchId,
          qty: hasNewQty ? Math.abs((safeNewQty as number) - safeOldQty) : Math.abs(safeQty as number),
          type: type || ((safeQty ?? 0) > 0 ? "STOCK_IN" : "STOCK_OUT"),
          reason,
        }
      });
      return stock;
    });

    emitBranch(branchId, "stockUpdated", { productId, branchId, qty: result.qty });
    res.json(result);
  } catch (error) {
    if (error instanceof ShiftConflict) {
      res.status(error.status).json({ error: error.message });
      return;
    }
    if (error instanceof OpnameConflict) {
      res.status(409).json({ error: error.message, code: "OPNAME_STOCK_CHANGED" });
      return;
    }
    if (error instanceof InsufficientAdjustmentStock) {
      res.status(400).json({ error: error.message, code: "INSUFFICIENT_STOCK" });
      return;
    }
    console.error("Stock Adjust Error:", error);
    res.status(500).json({ error: "Failed to adjust stock" });
  }
});

app.post("/api/stocks/transfer", authenticateToken, requireRole("ADMIN", "AUDIT", "CASHIER"), async (req, res) => {
  const { productId, qty, targetBranchId, sourceBranchId } = req.body;
  const requester = (req as any).user;
  // Cashiers may only transfer stock OUT of their own branch; ADMIN/AUDIT may transfer between any branches.
  if (requester.role === "CASHIER" && sourceBranchId !== requester.branchId) {
    return res.status(403).json({ error: "Kasir hanya dapat transfer stok dari cabangnya sendiri." });
  }
  if (!productId || !sourceBranchId || !targetBranchId) {
    return res.status(400).json({ error: "Produk atau cabang asal/tujuan tidak lengkap." });
  }
  if (sourceBranchId === targetBranchId) {
    return res.status(400).json({ error: "Cabang asal dan tujuan tidak boleh sama." });
  }
  const safeQty = toPositiveInt(qty);
  if (safeQty === null) {
    return res.status(400).json({ error: "Jumlah transfer harus bilangan bulat positif." });
  }
  try {
    const result = await prisma.$transaction(async (tx) => {
      if (requester.role === "CASHIER") {
        await lockBranch(tx, requester.branchId);
        const activeShift = await tx.shift.findFirst({
          where: {
            branchId: requester.branchId,
            cashierId: requester.userId,
            status: "open",
          },
          select: { id: true },
        });
        if (!activeShift) {
          throw new ShiftConflict("Shift kasir belum dibuka atau sudah ditutup. Buka shift sebelum transfer stok.");
        }
      }

      // 1. Kurangi dari asal — guard atomik agar stok asal tidak bisa minus walau
      // ada transfer/penjualan bersamaan. UPDATE hanya jalan bila stok masih cukup.
      const decremented = await tx.productStock.updateMany({
        where: { productId, branchId: sourceBranchId, qty: { gte: safeQty } },
        data: { qty: { decrement: safeQty } }
      });
      if (decremented.count === 0) {
        throw new Error("Stok cabang asal tidak mencukupi");
      }
      const sourceStock = await tx.productStock.findUnique({
        where: { productId_branchId: { productId, branchId: sourceBranchId } }
      });

      // 2. Tambah ke tujuan
      const targetStock = await tx.productStock.upsert({
        where: { productId_branchId: { productId, branchId: targetBranchId } },
        update: { qty: { increment: safeQty } },
        create: { productId, branchId: targetBranchId, qty: safeQty }
      });

      // 3. Catat log asal
      await tx.adjustment.create({
        data: {
          productId,
          branchId: sourceBranchId,
          qty: safeQty,
          type: "TRANSFER_OUT",
          reason: `Transfer ke Cabang ID: ${targetBranchId}`,
        }
      });

      // 4. Catat log tujuan
      await tx.adjustment.create({
        data: {
          productId,
          branchId: targetBranchId,
          qty: safeQty,
          type: "TRANSFER_IN",
          reason: `Transfer dari Cabang ID: ${sourceBranchId}`,
        }
      });

      return { sourceStock, targetStock };
    });

    emitBranch(sourceBranchId, "stockUpdated", { productId, branchId: sourceBranchId, qty: result.sourceStock?.qty ?? 0 });
    emitBranch(targetBranchId, "stockUpdated", { productId, branchId: targetBranchId, qty: result.targetStock.qty });
    res.json({ success: true });
  } catch (error: any) {
    if (error instanceof ShiftConflict) {
      return res.status(error.status).json({ error: error.message });
    }
    console.error("Stock Transfer Error:", error);
    res.status(400).json({ error: error.message || "Failed to transfer stock" });
  }
});

app.patch("/api/users/:id", authenticateToken, async (req, res) => {
  // Security: only admins may modify users (role/branch/status/password). Without this
  // check any authenticated user could escalate their own role to ADMIN.
  if ((req as any).user.role !== "ADMIN") return res.status(403).json({ error: "Forbidden" });
  const { role, branchId, status, name, alternativeNames, password } = req.body;
  try {
    const updateData: any = {};
    if (role !== undefined) updateData.role = role;
    if (branchId !== undefined) updateData.branchId = branchId === "" ? null : branchId;
    if (status !== undefined) updateData.status = status;
    if (name !== undefined) updateData.name = name;
    if (alternativeNames !== undefined) updateData.alternativeNames = alternativeNames;
    
    if (password) {
      updateData.password = await bcrypt.hash(password, 10);
    }

    const user = await prisma.user.update({
      where: { id: req.params.id },
      data: updateData
    });
    const { password: _, ...userWithoutPassword } = user;
    res.json(userWithoutPassword);
  } catch (error) {
    console.error("User Update Error:", error);
    res.status(500).json({ error: "Gagal update data user. Pastikan data valid." });
  }
});

app.delete("/api/users/:id", authenticateToken, async (req, res) => {
  if ((req as any).user.role !== "ADMIN") return res.status(403).json({ error: "Forbidden" });
  const targetId = req.params.id;
  // Prevent self-deletion — admin cannot lock themselves out.
  if ((req as any).user.userId === targetId) {
    return res.status(400).json({ error: "Tidak bisa menghapus akun Anda sendiri." });
  }
  try {
    // A user with any operational history (sales, commissions, shifts) cannot be hard-deleted:
    // doing so would corrupt reports, bonus ledgers, and shift records. The correct action is
    // to set status = "Inactive" to revoke access while preserving the history.
    const [salesCount, commissionsCount, shiftsCount] = await Promise.all([
      prisma.sale.count({ where: { cashierId: targetId } }),
      prisma.commission.count({ where: { cashierId: targetId } }),
      prisma.shift.count({ where: { cashierId: targetId } }),
    ]);
    if (salesCount > 0 || commissionsCount > 0 || shiftsCount > 0) {
      return res.status(400).json({
        error: `Karyawan tidak dapat dihapus karena memiliki riwayat operasional (${salesCount} penjualan, ${shiftsCount} shift, ${commissionsCount} komisi). Nonaktifkan akun dengan mengubah status menjadi "Inactive" untuk mencabut akses tanpa menghapus riwayat.`
      });
    }
    await prisma.user.delete({ where: { id: targetId } });
    res.json({ success: true });
  } catch (error) {
    console.error("Delete User Error:", error);
    res.status(500).json({ error: "Gagal menghapus karyawan." });
  }
});

app.post("/api/transactions/:id/refund", authenticateToken, requireRole("ADMIN", "CASHIER"), async (req, res) => {
  try {
    const requester = (req as any).user;
    const refundTarget = await prisma.sale.findUnique({ where: { id: req.params.id }, select: { branchId: true } });
    if (!refundTarget) return res.status(404).json({ error: "Transaksi tidak ditemukan." });
    // Cashiers may only refund sales belonging to their own branch; ADMIN may refund any.
    if (requester.role === "CASHIER") {
      if (refundTarget.branchId !== requester.branchId) {
        return res.status(403).json({ error: "Kasir hanya dapat me-refund transaksi cabangnya sendiri." });
      }
    }
    const result = await prisma.$transaction(async (tx) => {
      await lockBranch(tx, refundTarget.branchId);
      let activeShift: { openTime: Date } | null = null;
      if (requester.role === "CASHIER") {
        activeShift = await tx.shift.findFirst({
          where: {
            branchId: requester.branchId,
            cashierId: requester.userId,
            status: "open",
          },
          select: { openTime: true },
        });
        if (!activeShift) {
          throw new ShiftConflict("Shift kasir belum dibuka atau sudah ditutup. Refund tidak dapat diproses.");
        }
      }

      const sale = await tx.sale.findUnique({
        where: { id: req.params.id },
        include: { items: true, commissions: true }
      });

      if (!sale) throw new Error("Sale not found");
      if (requester.role === "CASHIER" &&
          (sale.cashierId !== requester.userId || sale.createdAt < activeShift!.openTime)) {
        throw new ShiftConflict("Refund hanya dapat dilakukan untuk transaksi pada shift kasir yang masih aktif.");
      }
      if (sale.status === "refunded") throw new ShiftConflict("Transaksi sudah diproses refund. Muat ulang data.");

      // 1. Update Sale Status
      const claimed = await tx.sale.updateMany({
        where: { id: sale.id, status: sale.status },
        data: { status: "refunded" },
      });
      if (claimed.count !== 1) throw new ShiftConflict("Transaksi sudah diproses refund. Muat ulang data.");
      const updatedSale = await tx.sale.findUniqueOrThrow({ where: { id: sale.id } });

      // 2. Restore Stock
      for (const item of sale.items) {
        await tx.productStock.upsert({
          where: {
            productId_branchId: {
              productId: item.productId,
              branchId: sale.branchId
            }
          },
          update: {
            qty: { increment: item.qty }
          },
          create: {
            productId: item.productId,
            branchId: sale.branchId,
            qty: item.qty
          }
        });
      }

      // 3. Reverse ONLY commissions that are still claimable ("earned"). Commissions that
      // were already withdrawn (paid out to the cashier) must not be touched by a refund.
      // Flipping earned -> refunded lowers the branch's earned total automatically, so the
      // claimable bonus drops on refund and can never go negative (no counter to subtract).
      await tx.commission.updateMany({
        where: { saleId: sale.id, status: "earned" },
        data: { status: "refunded", refundedAt: new Date() }
      });

      return updatedSale;
    });

    emitBranch((result as any).branchId, "saleUpdated", result);
    emitBranch((result as any).branchId, "commissionsUpdated", { branchId: (result as any).branchId });
    res.json(result);
  } catch (error: any) {
    if (error instanceof ShiftConflict) return res.status(error.status).json({ error: error.message });
    console.error("Refund Sale Error:", error);
    res.status(500).json({ error: error.message || "Failed to refund sale" });
  }
});

app.post("/api/incentives/withdraw", authenticateToken, requireRole("ADMIN"), async (req, res) => {
  const { branchId } = req.body;
  if (!branchId || typeof branchId !== "string") {
    return res.status(400).json({ error: "branchId wajib diisi." });
  }
  try {
    const result = await prisma.commission.updateMany({
      where: {
        branchId,
        status: "earned"
      },
      data: {
        status: "withdrawn",
        withdrawnAt: new Date()
      }
    });
    // Notify the branch (cashiers) and admins so their bonus balances refresh in real time.
    emitBranch(branchId, "commissionsUpdated", { branchId });
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: "Failed to withdraw commissions" });
  }
});

app.get("/api/incentives/summary", authenticateToken, async (req, res) => {
  const { branchId } = req.query;
  const user = (req as any).user;
  try {
    const where: any = { status: "earned" };
    // Branch isolation: CASHIER is always scoped to their own branch and cannot
    // request other branches or global totals. ADMIN/AUDIT may filter by branch.
    if (user.role === "CASHIER") {
      where.branchId = user.branchId;
    } else if (branchId) {
      where.branchId = branchId as string;
    }

    const commissions = await prisma.commission.findMany({
      where,
      select: {
        amount: true,
        branchId: true
      }
    });

    const total = commissions.reduce((sum, c) => sum + Number(c.amount), 0);
    const byBranch = commissions.reduce((acc: any, c) => {
      acc[c.branchId] = (acc[c.branchId] || 0) + Number(c.amount);
      return acc;
    }, {});

    res.json({ total, byBranch });
  } catch (error) {
    res.status(500).json({ error: "Failed to fetch commission summary" });
  }
});

app.post("/api/adjustments/cleanup", authenticateToken, async (req, res) => {
  if ((req as any).user.role !== "ADMIN") return res.status(403).json({ error: "Forbidden" });
  try {
    const result = await prisma.adjustment.deleteMany({
      where: {
        createdAt: {
          lt: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) // Older than 30 days
        }
      }
    });
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: "Failed to cleanup adjustments" });
  }
});

// --- SHOPPING PLANS (stored locally; replaces the old Firestore "shoppingPlans" collection) ---
app.get("/api/shopping-plans", authenticateToken, async (req, res) => {
  try {
    const plans = await prisma.shoppingPlan.findMany({ orderBy: { createdAt: "desc" } });
    res.json(plans);
  } catch (error: any) {
    console.error("Get Shopping Plans Error:", error);
    res.status(500).json({ error: error.message });
  }
});

app.post("/api/shopping-plans", authenticateToken, requireRole("ADMIN"), async (req: any, res) => {
  try {
    const { title, items, status } = req.body;
    // Security: creatorId is always taken from the authenticated token, never from
    // the client body, to prevent identity spoofing.
    const plan = await prisma.shoppingPlan.create({
      data: {
        title: title || null,
        items: items ?? [],
        status: status || "DRAFT",
        creatorId: req.user?.userId || null,
      },
    });
    res.json(plan);
  } catch (error: any) {
    console.error("Create Shopping Plan Error:", error);
    res.status(500).json({ error: error.message });
  }
});

app.delete("/api/shopping-plans/:id", authenticateToken, requireRole("ADMIN"), async (req, res) => {
  try {
    await prisma.shoppingPlan.delete({ where: { id: req.params.id } });
    res.json({ success: true });
  } catch (error: any) {
    console.error("Delete Shopping Plan Error:", error);
    res.status(500).json({ error: error.message });
  }
});

registerBranchReadRoutes(app, prisma, authenticateToken, getLogicalShiftDate);
registerOwnerDashboardRoutes(app, prisma, authenticateToken, requireRole("ADMIN"), getLogicalShiftDate);

async function startServer() {
  // Last-resort error middleware: any synchronous throw or forwarded error from a
  // route returns a clean 500 instead of leaking a stack trace or hanging the request.
  app.use((err: any, _req: any, res: any, _next: any) => {
    console.error("Unhandled route error:", err);
    if (!res.headersSent) {
      res.status(500).json({ error: "Terjadi kesalahan internal pada server." });
    }
  });

  // Keep the POS online: a single stray rejection/exception anywhere must not take
  // the whole API down and knock every cashier offline. Log loudly and stay alive.
  process.on("unhandledRejection", (reason) => {
    console.error("⚠️ Unhandled promise rejection:", reason);
  });
  process.on("uncaughtException", (err) => {
    console.error("⚠️ Uncaught exception:", err);
  });

  // Connection and read-only compatibility checks must precede listening.
  await prepareDatabase(prisma, readiness.verify, () => new Promise<void>((resolve, reject) => {
    httpServer.once("error", reject);
    httpServer.listen(PORT, "0.0.0.0", () => {
      httpServer.removeListener("error", reject);
      console.log(`Server running on http://localhost:${PORT}; database and schema ready; automatic maintenance disabled.`);
      resolve();
    });
  }));
}

startServer().catch(async () => {
  console.error("API startup refused: database unavailable or incompatible. No automatic repair performed.");
  try { await prisma.$disconnect(); } finally { process.exit(1); }
});

