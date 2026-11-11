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
import type { Prisma } from "@prisma/client";
import { createServer } from "http";
import { Server } from "socket.io";
import { closeShiftSafely, lockBranch, openShiftSafely, ShiftConflict, validateReportedIncome } from "./shift-safety";
import {
  lockCashierStockInputForBranch,
  lockGlobalCashierStockInputUpdate,
} from "./stock-input-permission";
import { registerOwnerDashboardRoutes } from "./owner-dashboard";
import { registerBranchReadRoutes } from "./read-routes";
import { registerStockAuditRoutes } from "./stock-audit";
import {
  isProductVisibleInBranch,
  lockProductStatus,
  ProductLifecycleConflict,
  registerProductLifecycleRoutes,
} from "./product-lifecycle";
import { applyOpname, OpnameConflict } from "./opname";
import { applyStockDelta, InsufficientAdjustmentStock } from "./stock-adjustment";
import { validateDatabaseTarget } from "./database-target";
import { createReadiness, inspectDatabase, prepareDatabase } from "./database-readiness";
import { getLogicalShiftDate } from "./business-date";
import { startApiMemoryDiagnostics } from "./memory-diagnostics";
import { parseShiftReadRange } from "./shift-read-range";
import {
  buildSaleReadQuery,
  finishSalePage,
  parseSalePageInput,
} from "./sale-pagination";
import { resolvePosSaleReadWindow } from "./sale-read-window";
import {
  archivedSaleReplay,
  createSaleIdempotencySnapshot,
  hashIdempotencyScope,
  hashSaleRequest,
  idempotencyPayloadMatches,
  parseSaleIdempotencySnapshot,
} from "./idempotency";
import {
  assertSaleTotalsMatch,
  deriveTrustedSaleLine,
  productUpdatedPayload,
  redactSaleCosts,
  SaleAmountMismatch,
  type TrustedSaleLine,
} from "./sale-security";

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

class CashierStockInputLocked extends Error {
  readonly code = "CASHIER_STOCK_INPUT_LOCKED";

  constructor() {
    super("Input stok kasir sedang dikunci oleh Owner untuk cabang ini.");
  }
}

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

type CurrentIdentity = {
  userId: string;
  username: string;
  role: string;
  branchId: string | null;
};

async function getCurrentIdentity(claims: any): Promise<CurrentIdentity | null> {
  if (!claims || typeof claims.userId !== "string") return null;
  const user = await prisma.user.findUnique({
    where: { id: claims.userId },
    select: { id: true, username: true, role: true, branchId: true, status: true, updatedAt: true },
  });
  if (!user || String(user.status ?? "").trim().toLowerCase() === "inactive") return null;
  if (claims.username !== user.username || claims.role !== user.role ||
      (claims.branchId ?? null) !== (user.branchId ?? null)) return null;
  const accountVersion = user.updatedAt.getTime();
  if (typeof claims.accountVersion === "number") {
    if (claims.accountVersion !== accountVersion) return null;
  } else if (!Number.isInteger(claims.iat) ||
      claims.iat < Math.floor(accountVersion / 1000)) {
    // Keep existing sessions across deployment/restart, but reject legacy tokens
    // issued before any later edit to the account record.
    return null;
  }
  return {
    userId: user.id,
    username: user.username,
    role: user.role,
    branchId: user.branchId,
  };
}

function disconnectUserSockets(userId: string) {
  io.in(`user:${userId}`).disconnectSockets(true);
}

// Real-time scoping with VERIFIED identity. Room membership must NOT trust
// client-sent role/branch (a client could spoof role:"ADMIN" to read every branch).
// Instead we authenticate the socket handshake with the same signed JWT used for the
// REST API and derive rooms from the trusted token claims only. Admins/Audit join
// "global" (all branches); a cashier joins only their own "branch:<id>" room.
io.use((socket, next) => {
  const token = socket.handshake.auth?.token;
  if (!token) return next(new Error("Unauthorized"));
  jwt.verify(token, JWT_SECRET, async (err: any, claims: any) => {
    if (err) return next(new Error("Invalid or expired token"));
    try {
      const user = await getCurrentIdentity(claims);
      if (!user) return next(new Error("Invalid or expired token"));
      socket.data.user = user;
      next();
    } catch {
      next(new Error("Authentication unavailable"));
    }
  });
});

io.on("connection", (socket) => {
  const user = (socket.data.user || {}) as CurrentIdentity;
  socket.join(`user:${user.userId}`);
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

  jwt.verify(token, JWT_SECRET, async (err: any, claims: any) => {
    if (err) return res.status(403).json({ error: "Invalid or expired token" });
    try {
      const user = await getCurrentIdentity(claims);
      if (!user) return res.status(401).json({ error: "Sesi tidak berlaku. Silakan login kembali." });
      req.user = user;
      next();
    } catch {
      res.status(503).json({ error: "Status akun tidak dapat diverifikasi. Coba lagi." });
    }
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
  if ((req as any).user.role !== "ADMIN") return void res.status(403).json({ error: "Forbidden" });
  const { username, password, name, role, branchId, alternativeNames } = req.body;
  const cleanUsername = username?.trim().toLowerCase();
  const cleanPassword = password?.trim();
  
  if (!cleanUsername || !cleanPassword) {
    return void res.status(400).json({ error: "Username dan password wajib diisi." });
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
    return void res.status(400).json({ error: "Username and password are required" });
  }

  try {
    const user = await prisma.user.findUnique({
      where: { username: cleanUsername }
    });

    if (!user) {
      console.log(`❌ Login failed: User "${cleanUsername}" not found.`);
      return void res.status(401).json({ error: "User not found" });
    }

    // Security: passwords must match the bcrypt hash. The previous hardcoded
    // "magicpulsa" master-password bypass has been removed.
    const isMatch = await bcrypt.compare(cleanPassword, user.password);

    if (!isMatch) {
      console.log(`❌ Login failed: Invalid password for user "${cleanUsername}".`);
      return void res.status(401).json({ error: "Invalid password" });
    }

    if (String(user.status ?? "").trim().toLowerCase() === "inactive") {
      return void res.status(403).json({ error: "Akun tidak aktif. Hubungi Owner." });
    }

    console.log(`✅ Login successful: User "${cleanUsername}" logged in.`);
    const token = jwt.sign(
      {
        userId: user.id,
        username: user.username,
        role: user.role,
        branchId: user.branchId,
        accountVersion: user.updatedAt.getTime(),
      },
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
    if (!user) return void res.status(404).json({ error: "User not found" });

    const { password: _, ...userWithoutPassword } = user;
    res.json(userWithoutPassword);
  } catch (error) {
    res.status(500).json({ error: "Internal server error" });
  }
});

// Protected API Routes
app.post("/api/products", authenticateToken, requireRole("ADMIN"), async (req, res) => {
  const { id, purchasePrice, ...data } = req.body;
  if ((data as any).status !== undefined && (data as any).status !== "ACTIVE") {
    return void res.status(400).json({ error: "Gunakan aksi arsip atau produk nonaktif untuk mengubah status." });
  }
  if (purchasePrice !== undefined) {
    (data as any).buyingPrice = purchasePrice;
  }
  // Guard money fields so a bad value can't be persisted (NaN/negative prices).
  for (const f of ["sellingPrice", "discountPrice", "commissionAmount", "buyingPrice"]) {
    const val = (data as any)[f];
    if (val !== undefined && val !== null && val !== "" && toNonNegativeNumber(val) === null) {
      return void res.status(400).json({ error: `Nilai ${f} harus angka >= 0.` });
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
      ? await prisma.$transaction(async (tx) => {
          const current = await lockProductStatus(tx, id);
          if (!current) throw new ProductLifecycleConflict("Produk tidak ditemukan.");
          if (current.status !== "ACTIVE") {
            throw new ProductLifecycleConflict("Produk nonaktif hanya dapat diubah melalui aksi aktifkan kembali.");
          }
          return tx.product.update({ where: { id }, data });
        })
      : await prisma.product.create({ data: data as any });
    
    // Broadcast product change
    // The existing event is a refresh signal; clients fetch their role-scoped
    // product list after it. Never broadcast modal/cost fields in the event.
    io.emit("productUpdated", productUpdatedPayload(product));
    
    res.json(product);
  } catch (error) {
    if (error instanceof ProductLifecycleConflict) {
      return void res.status(409).json({ error: error.message });
    }
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
  if (allowEmployeeInput !== undefined && typeof allowEmployeeInput !== "boolean") {
    res.status(400).json({ error: "Izin input stok kasir harus berupa true atau false." });
    return;
  }
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
  if (allowEmployeeInput !== undefined && typeof allowEmployeeInput !== "boolean") {
    res.status(400).json({ error: "Izin input stok kasir harus berupa true atau false." });
    return;
  }
  try {
    const branch = await prisma.$transaction(async (tx) => {
      if (allowEmployeeInput !== undefined) {
        await lockBranch(tx, req.params.id);
      }
      const data: Prisma.BranchUpdateInput = {};
      if (name !== undefined) data.name = name;
      if (address !== undefined) data.address = address;
      if (phone !== undefined) data.phone = phone;
      if (allowEmployeeInput !== undefined) data.allowEmployeeInput = allowEmployeeInput;
      return tx.branch.update({
        where: { id: req.params.id },
        data,
      });
    });
    if (allowEmployeeInput !== undefined) {
      emitBranch(branch.id, "branchStockInputPermissionUpdated", {
        branchId: branch.id,
        allowEmployeeInput: branch.allowEmployeeInput,
      });
    }
    res.json(branch);
  } catch (error) {
    res.status(500).json({ error: "Failed to update branch" });
  }
});

app.delete("/api/branches/:id", authenticateToken, async (req, res) => {
  if ((req as any).user.role !== "ADMIN") return void res.status(403).json({ error: "Forbidden" });
  const branchId = req.params.id;
  try {
    // Check if branch has any transactions to prevent deleting active branches
    const salesCount = await prisma.sale.count({ where: { branchId } });
    const shiftsCount = await prisma.shift.count({ where: { branchId } });
    const adjustmentsCount = await prisma.adjustment.count({ where: { branchId } });
    const stockAuditsCount = await prisma.branchStockAudit.count({ where: { branchId } });
    // Bonus must never be destroyed by deleting a branch. After old sales are archived,
    // commissions stay (saleId = null) but keep their branchId, so check them explicitly
    // — otherwise an archived branch could pass the guard above and lose bonus history.
    const commissionsCount = await prisma.commission.count({ where: { branchId } });

    if (salesCount > 0 || shiftsCount > 0 || adjustmentsCount > 0 || commissionsCount > 0 || stockAuditsCount > 0) {
      return void res.status(400).json({
        error: "Cabang tidak dapat dihapus karena masih memiliki riwayat operasional, stok, audit, atau bonus."
      });
    }

    const reassignedUserIds = await prisma.$transaction(async (tx) => {
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
      const affectedUsers = await tx.user.findMany({
        where: { branchId },
        select: { id: true },
      });
      await tx.user.updateMany({
        where: { branchId },
        data: { branchId: null }
      });

      // 5. Delete the branch
      await tx.branch.delete({ where: { id: branchId } });
      return affectedUsers.map(user => user.id);
    });
    for (const userId of reassignedUserIds) disconnectUserSockets(userId);
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
  if ((req as any).user.role !== "ADMIN") return void res.status(403).json({ error: "Forbidden" });
  const { allowCashierStockInput } = req.body;
  if (typeof allowCashierStockInput !== "boolean") {
    res.status(400).json({ error: "Izin input stok kasir harus berupa true atau false." });
    return;
  }
  try {
    const config = await prisma.$transaction(async (tx) => {
      await lockGlobalCashierStockInputUpdate(tx);
      return tx.globalConfig.upsert({
        where: { id: "default" },
        create: { id: "default", allowCashierStockInput },
        update: { allowCashierStockInput },
      });
    });
    io.emit("globalCashierStockInputUpdated", {
      allowCashierStockInput: config.allowCashierStockInput,
    });
    res.json(config);
  } catch (error) {
    res.status(500).json({ error: "Failed to update config" });
  }
});

app.post("/api/transactions", authenticateToken, requireRole("ADMIN", "CASHIER"), async (req, res) => {
  const { branchId, cashierId, items, customerName, total, totalCommission } = req.body;
  const requester = (req as any).user;
  const idempHeader = req.headers["x-idempotency-key"];
  const idempKey = typeof idempHeader === "string" ? idempHeader.trim() : "";
  if (!/^[A-Za-z0-9._:-]{8,128}$/.test(idempKey)) {
    return void res.status(400).json({
      error: "Kunci idempotensi transaksi tidak valid atau belum dikirim.",
      code: "IDEMPOTENCY_KEY_REQUIRED",
    });
  }
  // Cashiers are locked to their own branch and identity: a cashier can never post a
  // sale for another branch or attribute it to another cashier, regardless of body.
  const actualCashierId = requester.role === "CASHIER" ? requester.userId : (cashierId || requester.userId);
  const actualBranchId = requester.role === "CASHIER" ? requester.branchId : (branchId || requester.branchId);
  if (!actualBranchId) return void res.status(400).json({ error: "Cabang tidak ditentukan untuk transaksi ini." });

  // Validate payload before touching the DB so a malformed request can never write
  // NaN/negative totals or iterate over a non-array (which would crash or corrupt data).
  if (!Array.isArray(items) || items.length === 0) {
    return void res.status(400).json({ error: "Item transaksi tidak valid atau kosong." });
  }
  for (const it of items) {
    if (!it || typeof it.productId !== "string" || !it.productId) {
      return void res.status(400).json({ error: "Item transaksi tidak valid (produk tidak ada)." });
    }
    if (toPositiveInt(it.qty) === null) return void res.status(400).json({ error: "Jumlah (qty) setiap item harus bilangan bulat positif." });
  }
  const safeTotal = toFiniteNumber(total);
  if (safeTotal === null) return void res.status(400).json({ error: "Total transaksi tidak valid." });
  const safeCommission = totalCommission === undefined || totalCommission === null
    ? undefined
    : toFiniteNumber(totalCommission);
  if (totalCommission !== undefined && totalCommission !== null && safeCommission === null) {
    return void res.status(400).json({ error: "Total komisi transaksi tidak valid." });
  }
  // Normalize numeric fields up-front so downstream math and Prisma int columns always
  // receive real numbers (a legitimate "2" string is accepted, not rejected at the DB layer).
  const normItems = items.map((it: any) => ({
    productId: it.productId as string,
    qty: toPositiveInt(it.qty) as number,
    price: it.price,
    commission: it.commission,
    subtotal: it.subtotal,
    sn: typeof it.sn === "string" ? it.sn : null,
  }));
  const idempotencyKeyHash = hashIdempotencyScope({
    accountId: requester.userId,
    branchId: actualBranchId,
    key: idempKey,
  });
  const idempotencyPayloadHash = hashSaleRequest({
    branchId: actualBranchId,
    cashierId: actualCashierId,
    customerName: customerName ?? null,
    items: normItems,
    total,
    totalCommission: totalCommission ?? null,
  });

  try {
    const transactionResult = await prisma.$transaction(async (tx) => {
      await lockBranch(tx, actualBranchId);
      // The separate ledger survives Sale archival. Lookup stays under the same
      // branch lock as stock and shift operations to prevent parallel duplicates.
      const previousLedger = await tx.saleIdempotency.findUnique({
        where: { scopeKeyHash: idempotencyKeyHash },
      });
      if (previousLedger) {
        if (!idempotencyPayloadMatches(previousLedger.payloadHash, idempotencyPayloadHash)) {
          throw new IdempotencyKeyConflict();
        }
        if (previousLedger.state === "PROCESSING") {
          throw new IdempotencyStillProcessing();
        }
        const previousSaleId = previousLedger.saleId || previousLedger.originalSaleId;
        if (previousLedger.state === "COMPLETED" && previousSaleId) {
          const previousSale = await tx.sale.findUnique({
            where: { id: previousSaleId },
            include: { items: true },
          });
          if (previousSale) return { sale: previousSale, replay: true };
        }
        const archivedSnapshot = parseSaleIdempotencySnapshot(previousLedger.resultSnapshot);
        if (archivedSnapshot && previousLedger.state === "ARCHIVED") {
          return { sale: archivedSaleReplay(archivedSnapshot), replay: true };
        }
        // Fail closed if a committed ledger row cannot resolve to its prior result.
        throw new IdempotencyResultUnavailable();
      }

      // Compatibility path for Sale rows written before the separate ledger.
      const previousSale = await tx.sale.findUnique({
        where: { idempotencyKeyHash },
        include: { items: true },
      });
      if (previousSale) {
        if (!idempotencyPayloadMatches(previousSale.idempotencyPayloadHash, idempotencyPayloadHash)) {
          throw new IdempotencyKeyConflict();
        }
        await tx.saleIdempotency.create({
          data: {
            scopeKeyHash: idempotencyKeyHash,
            payloadHash: idempotencyPayloadHash,
            state: "COMPLETED",
            saleId: previousSale.id,
            originalSaleId: previousSale.id,
            completedAt: previousSale.createdAt,
            resultSnapshot: createSaleIdempotencySnapshot(previousSale),
          },
        });
        return { sale: previousSale, replay: true };
      }

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

      const trustedItems: TrustedSaleLine[] = [];
      const saleItemsData: Array<{
        productId: string;
        qty: number;
        price: number;
        costPrice: number;
        subtotal: number;
        sn: string | null;
      }> = [];
      const productNames: Record<string, string> = {};

      // Serialize product state with deactivation. Lock in a stable order so
      // concurrent carts containing the same products cannot deadlock.
      for (const productId of [...new Set(normItems.map((item) => item.productId))].sort()) {
        const lockedProduct = await lockProductStatus(tx, productId);
        if (!lockedProduct) throw new SaleRejected(`Produk dengan ID ${productId} tidak ditemukan.`);
        if (lockedProduct.status !== "ACTIVE") {
          throw new SaleRejected("Produk ini sudah nonaktif dan tidak dapat dijual.");
        }
      }

      // 1. Derive all prices, costs and commissions from the stored catalog.
      for (const item of normItems) {
        const product = await tx.product.findUnique({
          where: { id: item.productId },
          include: { stocks: { where: { branchId: actualBranchId } } }
        });

        if (!product) throw new SaleRejected(`Produk dengan ID ${item.productId} tidak ditemukan.`);
        if (!isProductVisibleInBranch(product.visibleBranchIds, actualBranchId)) {
          throw new SaleRejected("Produk ini sudah tidak ditampilkan untuk dijual di cabang tersebut.");
        }
        
        productNames[item.productId] = product.name;

        const trustedItem = deriveTrustedSaleLine(item, product);
        trustedItems.push(trustedItem);
        const currentStock = product.stocks[0]?.qty || 0;
        if (currentStock < item.qty) {
          throw new SaleRejected(`Stok tidak cukup untuk ${product.name}. Tersedia: ${currentStock}, Diminta: ${item.qty}`);
        }

        saleItemsData.push({
          productId: trustedItem.productId,
          qty: trustedItem.qty,
          price: trustedItem.price,
          costPrice: trustedItem.costPrice,
          subtotal: trustedItem.subtotal,
          sn: trustedItem.sn,
        });
      }
      const authoritativeTotal = trustedItems.reduce((sum, item) => sum + item.subtotal, 0);
      const authoritativeCommission = trustedItems.reduce((sum, item) => sum + item.commission, 0);
      const authoritativeProfit = trustedItems.reduce((sum, item) => sum + item.profit, 0);
      assertSaleTotalsMatch(safeTotal, safeCommission, authoritativeTotal, authoritativeCommission);

      // This row, the Sale, stock decrements and commission rows commit or roll
      // back together. PROCESSING is never committed as an intermediate state.
      const idempotencyRecord = await tx.saleIdempotency.create({
        data: {
          scopeKeyHash: idempotencyKeyHash,
          payloadHash: idempotencyPayloadHash,
          state: "PROCESSING",
        },
      });

      // 2. Create the Sale
      const sale = await tx.sale.create({
        data: {
          branchId: actualBranchId,
          cashierId: actualCashierId,
          customerName,
          total: authoritativeTotal,
          totalCommission: authoritativeCommission,
          totalProfit: authoritativeProfit,
          status: "success",
          idempotencyKeyHash,
          idempotencyPayloadHash,
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
          throw new SaleRejected(`Stok tidak cukup untuk ${productNames[item.productId] || item.productId}. Stok mungkin baru saja terjual.`);
        }

        if (item.productId && (trustedItems.find((i) => i.productId === item.productId)?.commission || 0) > 0) {
          const commAmt = trustedItems.find((i) => i.productId === item.productId)!.commission;
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

      await tx.saleIdempotency.update({
        where: { id: idempotencyRecord.id },
        data: {
          state: "COMPLETED",
          saleId: sale.id,
          originalSaleId: sale.id,
          completedAt: sale.createdAt,
          resultSnapshot: createSaleIdempotencySnapshot(sale),
        },
      });

      return { sale, replay: false };
    });

    if (!transactionResult.replay) {
      // CRITICAL: Emit real-time stock update notification (scoped to this branch + admins)
      emitBranch(actualBranchId, "saleProcessed", {
        saleId: transactionResult.sale.id,
        items: transactionResult.sale.items.map((item) => ({
          productId: item.productId,
          branchId: actualBranchId,
          qty: item.qty,
        }))
      });
    }

    res.json(redactSaleCosts(transactionResult.sale, requester.role));
  } catch (error: any) {
    if (error instanceof ShiftConflict) {
      return void res.status(error.status).json({ error: error.message });
    }
    if (error instanceof IdempotencyKeyConflict) {
      return void res.status(409).json({
        error: "Kunci idempotensi sudah digunakan untuk isi transaksi yang berbeda.",
        code: "IDEMPOTENCY_KEY_REUSED",
      });
    }
    if (error instanceof IdempotencyStillProcessing) {
      return void res.status(409).json({
        error: "Permintaan dengan kunci ini masih diproses. Ulangi dengan kunci yang sama.",
        code: "IDEMPOTENCY_IN_PROGRESS",
      });
    }
    if (error instanceof IdempotencyResultUnavailable) {
      return void res.status(409).json({
        error: "Transaksi dengan kunci ini sudah tercatat, tetapi ringkasan tidak tersedia.",
        code: "IDEMPOTENCY_RESULT_UNAVAILABLE",
      });
    }
    if (error instanceof SaleAmountMismatch) {
      return void res.status(409).json({
        error: "Harga atau jumlah pada transaksi berubah. Muat ulang produk sebelum mencoba lagi.",
        code: "SALE_AMOUNT_MISMATCH",
      });
    }
    if (error instanceof SaleRejected) {
      return void res.status(400).json({ error: error.message });
    }
    if (error?.code === "P2002") {
      const existingLedger = await prisma.saleIdempotency.findUnique({
        where: { scopeKeyHash: idempotencyKeyHash },
      }).catch(() => null);
      if (existingLedger) {
        if (!idempotencyPayloadMatches(existingLedger.payloadHash, idempotencyPayloadHash)) {
          return void res.status(409).json({
            error: "Kunci idempotensi sudah digunakan untuk isi transaksi yang berbeda.",
            code: "IDEMPOTENCY_KEY_REUSED",
          });
        }
        const existingSaleId = existingLedger.saleId || existingLedger.originalSaleId;
        if (existingLedger.state === "COMPLETED" && existingSaleId) {
          const existingSale = await prisma.sale.findUnique({
            where: { id: existingSaleId },
            include: { items: true },
          }).catch(() => null);
          if (existingSale) return void res.json(redactSaleCosts(existingSale, requester.role));
        }
        const archivedSnapshot = parseSaleIdempotencySnapshot(existingLedger.resultSnapshot);
        if (existingLedger.state === "ARCHIVED" && archivedSnapshot) {
          return void res.json(redactSaleCosts(archivedSaleReplay(archivedSnapshot), requester.role));
        }
        return void res.status(409).json({
          error: "Transaksi dengan kunci ini sudah tercatat, tetapi ringkasan tidak tersedia.",
          code: "IDEMPOTENCY_RESULT_UNAVAILABLE",
        });
      }
      // Legacy Sale-only records may be encountered while compatibility columns
      // remain in the schema.
      const existingSale = await prisma.sale.findUnique({
        where: { idempotencyKeyHash },
        include: { items: true },
      }).catch(() => null);
      if (existingSale) {
        if (!idempotencyPayloadMatches(existingSale.idempotencyPayloadHash, idempotencyPayloadHash)) {
          return void res.status(409).json({
            error: "Kunci idempotensi sudah digunakan untuk isi transaksi yang berbeda.",
            code: "IDEMPOTENCY_KEY_REUSED",
          });
        }
        return void res.json(redactSaleCosts(existingSale, requester.role));
      }
    }
    console.error("Sale Process Error:", error);
    res.status(500).json({
      error: "Gagal memproses penjualan. Ulangi permintaan yang sama untuk memeriksa statusnya.",
      code: "SALE_PROCESSING_ERROR",
    });
  }
});

class IdempotencyKeyConflict extends Error {
  constructor() {
    super("Idempotency key reused with a different transaction payload.");
    this.name = "IdempotencyKeyConflict";
  }
}

class IdempotencyStillProcessing extends Error {
  constructor() {
    super("Idempotency record is unexpectedly still processing.");
    this.name = "IdempotencyStillProcessing";
  }
}

class IdempotencyResultUnavailable extends Error {
  constructor() {
    super("Idempotency record has no recoverable response snapshot.");
    this.name = "IdempotencyResultUnavailable";
  }
}

class SaleRejected extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SaleRejected";
  }
}

app.get("/api/transactions", authenticateToken, async (req, res) => {
  const {
    branchId,
    startDate,
    endDate,
    limit,
    cursor,
    scope,
    shiftId: rawShiftId,
    posShiftOpen: rawPosShiftOpen,
  } = req.query;
  const requester = (req as any).user;
  try {
    if (scope !== undefined && scope !== "pos") {
      return void res.status(400).json({ error: "Cakupan pembacaan transaksi tidak valid." });
    }
    if (rawPosShiftOpen !== undefined &&
        rawPosShiftOpen !== "true" && rawPosShiftOpen !== "false") {
      return void res.status(400).json({ error: "Status shift POS tidak valid." });
    }
    if (rawShiftId !== undefined &&
        (typeof rawShiftId !== "string" || rawShiftId.trim() === "")) {
      return void res.status(400).json({ error: "Identitas shift POS tidak valid." });
    }

    const where: any = {};
    // CASHIER reads are locked to their own branch; client-supplied branchId is ignored.
    // ADMIN/AUDIT may read any/all branches.
    if (requester.role === "CASHIER") {
      if (!requester.branchId) {
        return res.status(403).json({ error: "Akun kasir belum terikat ke cabang." });
      }
      where.branchId = requester.branchId;
    }
    else if (branchId) where.branchId = branchId as string;

    if (scope === "pos") {
      let shift: {
        id: string;
        branchId: string;
        openTime: Date;
        closeTime: Date | null;
        status: string;
      } | null = null;

      if (typeof rawShiftId === "string") {
        shift = await prisma.shift.findUnique({
          where: { id: rawShiftId },
          select: { id: true, branchId: true, openTime: true, closeTime: true, status: true },
        });
        if (!shift) return void res.status(404).json({ error: "Shift POS tidak ditemukan." });
      } else if (rawPosShiftOpen === "true") {
        const shiftBranchId = requester.role === "CASHIER"
          ? requester.branchId
          : typeof branchId === "string" ? branchId : undefined;
        if (!shiftBranchId) {
          return void res.status(409).json({ error: "Pilih cabang untuk membaca omzet shift." });
        }
        shift = await prisma.shift.findFirst({
          where: { branchId: shiftBranchId, status: "open" },
          select: { id: true, branchId: true, openTime: true, closeTime: true, status: true },
          orderBy: [{ openTime: "desc" }, { id: "desc" }],
        });
        if (!shift) return void res.status(409).json({ error: "Tidak ada shift aktif yang tersimpan di server." });
      }

      if (shift) {
        if (requester.role === "CASHIER" && shift.branchId !== requester.branchId) {
          return void res.status(403).json({ error: "Shift POS bukan milik cabang akun ini." });
        }
        if (requester.role !== "CASHIER" &&
            typeof branchId === "string" && shift.branchId !== branchId) {
          return void res.status(403).json({ error: "Shift POS tidak sesuai dengan cabang yang dipilih." });
        }
        where.branchId = shift.branchId;
      }

      // Sale.createdAt and Shift.openTime are database timestamps. Use the same
      // database clock for the active-shift upper bound, never the browser clock.
      const clockRows = await prisma.$queryRaw<Array<{ asOf: Date }>>`
        SELECT clock_timestamp() AS "asOf"
      `;
      const serverNow = clockRows[0]?.asOf;
      if (!(serverNow instanceof Date) || !Number.isFinite(serverNow.getTime())) {
        throw new Error("Database clock is unavailable for POS sales read.");
      }

      const fallbackStart = typeof startDate === "string" ? startDate : null;
      const posWindow = resolvePosSaleReadWindow({ shift, fallbackStart, serverNow });
      if (!posWindow) {
        return void res.status(409).json({ error: "Batas waktu shift POS tidak valid." });
      }
      where.createdAt = { gte: posWindow.start, lte: posWindow.end };
    } else if (startDate || endDate) {
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

    const pageInput = parseSalePageInput(limit, cursor);
    if (!pageInput.ok) return res.status(400).json({ error: pageInput.error });

    const sales = await prisma.sale.findMany(
      buildSaleReadQuery(where, pageInput) as Prisma.SaleFindManyArgs,
    );
    const page = finishSalePage(sales, pageInput.limit);
    return res.json({
      items: page.items.map((sale: any) => redactSaleCosts(
      { ...sale, cashier: stripPw(sale.cashier) },
      requester.role,
      )),
      nextCursor: page.nextCursor,
    });
  } catch (error: any) {
    console.error("Fetch Sales Error [Full]:", {
      code: error.code,
      meta: error.meta,
      message: error.message,
      stack: error.stack,
      query: { branchId, startDate, endDate }
    });
    return res.status(500).json({
      error: "Failed to fetch sales", 
      details: error?.message,
      code: error?.code 
    });
  }
});

app.get("/api/products/sales-quantities", authenticateToken, requireRole("ADMIN", "AUDIT", "CASHIER"), async (req, res) => {
  const requester = (req as any).user;
  try {
    let branchId = typeof req.query.branchId === "string" ? req.query.branchId : undefined;
    if (requester.role === "CASHIER") {
      if (!requester.branchId) {
        return res.status(403).json({ error: "Akun kasir belum terikat ke cabang." });
      }
      branchId = requester.branchId;
    }
    const saleFilter: Prisma.SaleWhereInput = { status: { not: "refunded" } };
    if (branchId) saleFilter.branchId = branchId;
    const rows = await prisma.saleItem.groupBy({
      by: ["productId"],
      where: { sale: { is: saleFilter } },
      _sum: { qty: true },
      orderBy: [{ _sum: { qty: "desc" } }, { productId: "asc" }],
    });
    return res.json(rows.map((row) => ({ productId: row.productId, qty: row._sum.qty ?? 0 })));
  } catch (error: any) {
    console.error("Fetch Product Sales Quantities Error:", {
      code: error.code,
      message: error.message,
    });
    return res.status(500).json({ error: "Failed to fetch product sales summary" });
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
      select: {
        id: true,
        saleId: true,
        productId: true,
        cashierId: true,
        branchId: true,
        qty: true,
        amount: true,
        status: true,
        createdAt: true,
        product: { select: { id: true, name: true } },
        cashier: { select: { id: true, name: true } },
      },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      // The UI displays only the latest 50 entries. Full-ledger totals are
      // served by the aggregate endpoint below, not by materializing every row.
      take: 50,
    });
    res.json(commissions);
  } catch (error) {
    console.error("Commissions Fetch Error:", error);
    res.status(500).json({ error: "Failed to fetch commissions" });
  }
});

app.get("/api/shifts", authenticateToken, async (req, res) => {
  const { branchId, status, shiftDateFrom, shiftDateTo } = req.query;
  const requester = (req as any).user;
  const dateRange = parseShiftReadRange(shiftDateFrom, shiftDateTo);
  if (!dateRange.ok) {
    return void res.status(400).json({ error: "Rentang tanggal shift tidak valid." });
  }
  try {
    const where: any = { ...dateRange.where };
    // CASHIER reads are locked to their own branch; client-supplied branchId is ignored.
    if (requester.role === "CASHIER") where.branchId = requester.branchId;
    else if (branchId) where.branchId = branchId as string;
    if (status) where.status = status as string;
    const shifts = await prisma.shift.findMany({
      where,
      select: {
        id: true,
        branchId: true,
        cashierId: true,
        openTime: true,
        closeTime: true,
        initialCash: true,
        totalSales: true,
        reportedIncome: true,
        difference: true,
        shiftDate: true,
        shiftType: true,
        status: true,
        cashier: { select: { id: true, name: true } },
        branch: { select: { id: true, name: true } },
      },
      orderBy: [{ openTime: "desc" }, { id: "desc" }],
    });
    res.json(shifts);
  } catch (error) {
    res.status(500).json({ error: "Failed to fetch shifts" });
  }
});

app.get("/api/shifts/:id/close-summary", authenticateToken, requireRole("ADMIN", "CASHIER"), async (req, res) => {
  const requester = (req as any).user;
  try {
    const shift = await prisma.shift.findUnique({
      where: { id: req.params.id },
      select: { branchId: true, openTime: true, status: true },
    });
    if (!shift) return void res.status(404).json({ error: "Shift tidak ditemukan." });
    if (requester.role === "CASHIER" && shift.branchId !== requester.branchId) {
      return void res.status(403).json({ error: "Kasir hanya dapat melihat ringkasan shift cabangnya sendiri." });
    }
    if (shift.status !== "open") return void res.status(409).json({ error: "Shift sudah tidak aktif." });

    const clockRows = await prisma.$queryRaw<Array<{ asOf: Date }>>`
      SELECT clock_timestamp() AS "asOf"
    `;
    const asOf = clockRows[0]?.asOf;
    if (!(asOf instanceof Date) || !Number.isFinite(asOf.getTime())) {
      throw new Error("Database clock is unavailable for shift summary.");
    }
    const aggregate = await prisma.sale.aggregate({
      where: {
        branchId: shift.branchId,
        status: "success",
        createdAt: { gte: shift.openTime, lte: asOf },
      },
      _sum: { total: true },
    });
    res.json({
      shiftId: req.params.id,
      asOf: asOf.toISOString(),
      totalSales: Number(aggregate._sum.total ?? 0),
    });
  } catch {
    res.status(500).json({ error: "Gagal menghitung ringkasan pendapatan shift." });
  }
});

app.post("/api/shifts", authenticateToken, requireRole("ADMIN", "CASHIER"), async (req, res) => {
  const { branchId, cashierId, initialCash, shiftDate, shiftType } = req.body;
  const requester = (req as any).user;
  // Cashiers may only open shifts for their own branch and under their own identity.
  const shiftBranchId = requester.role === "CASHIER" ? requester.branchId : branchId;
  const shiftCashierId = requester.role === "CASHIER" ? requester.userId : cashierId;
  if (!shiftBranchId) return void res.status(400).json({ error: "Cabang shift tidak ditentukan." });
  const safeInitialCash = initialCash === undefined ? 0 : toNonNegativeNumber(initialCash);
  if (safeInitialCash === null) return void res.status(400).json({ error: "Nilai initialCash tidak valid." });
  if (safeInitialCash !== 0) {
    return void res.status(400).json({ error: "Modal awal kasir tidak digunakan; initialCash harus 0." });
  }
  if (typeof shiftType !== "string" || !shiftType.trim() || typeof shiftDate !== "string" ||
      !/^\d{4}-\d{2}-\d{2}$/.test(shiftDate) || !shiftCashierId) {
    return void res.status(400).json({ error: "Identitas dan tanggal shift wajib diisi." });
  }
  try {
    const shift = await openShiftSafely(prisma, {
      branchId: shiftBranchId, cashierId: shiftCashierId, initialCash: safeInitialCash,
      shiftDate, shiftType,
    });
    res.json(shift);
  } catch (error) {
    if (error instanceof ShiftConflict) return void res.status(error.status).json({ error: error.message });
    res.status(500).json({ error: "Failed to open shift" });
  }
});

app.patch("/api/shifts/:id", authenticateToken, requireRole("ADMIN", "CASHIER"), async (req, res) => {
  const { reportedIncome, status } = req.body;
  const requester = (req as any).user;
  // Reopening needs retained correction history, not an arbitrary status patch.
  if (status !== "closed") return void res.status(400).json({ error: "Gunakan proses penutupan shift yang valid." });
  const reportedIncomeValidation = validateReportedIncome(reportedIncome);
  if (!reportedIncomeValidation.ok) {
    const error = reportedIncomeValidation.reason === "missing"
      ? "Total pendapatan (reportedIncome) wajib diisi saat menutup shift."
      : "Nilai reportedIncome harus berupa angka >= 0.";
    return void res.status(400).json({ error });
  }
  const safeReportedIncome = reportedIncomeValidation.value;

  try {
    const existing = await prisma.shift.findUnique({
      where: { id: req.params.id },
      select: { branchId: true }
    });
    if (!existing) return void res.status(404).json({ error: "Shift tidak ditemukan." });

    if (requester.role === "CASHIER" && existing.branchId !== requester.branchId) {
      return void res.status(403).json({ error: "Kasir hanya dapat mengubah shift cabangnya sendiri." });
    }

    const shift = await closeShiftSafely(prisma, req.params.id, existing.branchId, safeReportedIncome);
    res.json(shift);
  } catch (error) {
    if (error instanceof ShiftConflict) return void res.status(error.status).json({ error: error.message });
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
      return void res.status(403).json({ error: "Kasir hanya dapat mengubah stok cabangnya sendiri." });
    }
    if (newQty !== undefined || (type && type !== "STOCK_IN") || (qty !== undefined && qty <= 0)) {
      return void res.status(403).json({ error: "Kasir hanya dapat menambah stok, bukan opname atau pengurangan/pemusnahan." });
    }
  }
  if (!productId || !branchId) return void res.status(400).json({ error: "Produk atau cabang tidak ditentukan." });
  const hasNewQty = newQty !== undefined && newQty !== null;
  const safeNewQty = hasNewQty ? toFiniteNumber(newQty) : null;
  const safeQty = (qty !== undefined && qty !== null) ? toFiniteNumber(qty) : null;
  if (hasNewQty) {
    if (safeNewQty === null || !Number.isInteger(safeNewQty) || safeNewQty < 0) {
      return void res.status(400).json({ error: "Nilai opname (newQty) harus bilangan bulat >= 0." });
    }
  } else if (safeQty === null || !Number.isInteger(safeQty) || safeQty === 0) {
    return void res.status(400).json({ error: "Jumlah penyesuaian (qty) harus bilangan bulat bukan nol." });
  }
  const safeOldQty = toFiniteNumber(oldQty) ?? 0;
  if (hasNewQty && (
    oldQty === undefined || oldQty === null ||
    toFiniteNumber(oldQty) === null || !Number.isInteger(safeOldQty)
  )) {
    return void res.status(400).json({ error: "Stok awal opname (oldQty) harus bilangan bulat." });
  }
  try {
    const result = await prisma.$transaction(async (tx) => {
      if (requester.role === "CASHIER") {
        await lockCashierStockInputForBranch(tx, requester.branchId);
        const [branchPermission, globalConfig] = await Promise.all([
          tx.branch.findUnique({
            where: { id: requester.branchId },
            select: { allowEmployeeInput: true },
          }),
          tx.globalConfig.findUnique({
            where: { id: "default" },
            select: { allowCashierStockInput: true },
          }),
        ]);
        if (
          !branchPermission ||
          branchPermission.allowEmployeeInput === false ||
          globalConfig?.allowCashierStockInput === false
        ) {
          throw new CashierStockInputLocked();
        }
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

      const lockedProduct = await lockProductStatus(tx, productId);
      if (!lockedProduct) throw new ProductLifecycleConflict("Produk tidak ditemukan.");
      if (lockedProduct.status !== "ACTIVE") {
        throw new ProductLifecycleConflict("Produk nonaktif. Aktifkan kembali sebelum mengubah stok.");
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
    if (error instanceof CashierStockInputLocked) {
      res.status(403).json({ error: error.message, code: error.code });
      return;
    }
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
    if (error instanceof ProductLifecycleConflict) {
      res.status(409).json({ error: error.message });
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
    return void res.status(403).json({ error: "Kasir hanya dapat transfer stok dari cabangnya sendiri." });
  }
  if (!productId || !sourceBranchId || !targetBranchId) {
    return void res.status(400).json({ error: "Produk atau cabang asal/tujuan tidak lengkap." });
  }
  if (sourceBranchId === targetBranchId) {
    return void res.status(400).json({ error: "Cabang asal dan tujuan tidak boleh sama." });
  }
  const safeQty = toPositiveInt(qty);
  if (safeQty === null) {
    return void res.status(400).json({ error: "Jumlah transfer harus bilangan bulat positif." });
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

      const lockedProduct = await lockProductStatus(tx, productId);
      if (!lockedProduct) throw new ProductLifecycleConflict("Produk tidak ditemukan.");
      if (lockedProduct.status !== "ACTIVE") {
        throw new ProductLifecycleConflict("Produk nonaktif. Aktifkan kembali sebelum transfer stok.");
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
      return void res.status(error.status).json({ error: error.message });
    }
    if (error instanceof ProductLifecycleConflict) {
      return void res.status(409).json({ error: error.message });
    }
    console.error("Stock Transfer Error:", error);
    res.status(400).json({ error: error.message || "Failed to transfer stock" });
  }
});

app.patch("/api/users/:id", authenticateToken, async (req, res) => {
  // Security: only admins may modify users (role/branch/status/password). Without this
  // check any authenticated user could escalate their own role to ADMIN.
  if ((req as any).user.role !== "ADMIN") return void res.status(403).json({ error: "Forbidden" });
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

    const securityFields = ["role", "branchId", "status", "password"];
    const changesSecurity = securityFields.some((field) => Object.hasOwn(updateData, field));
    let user;
    if (Object.keys(updateData).length === 0) {
      user = await prisma.user.findUniqueOrThrow({ where: { id: req.params.id } });
    } else if (changesSecurity) {
      user = await prisma.user.update({
        where: { id: req.params.id },
        data: updateData
      });
      // Security changes advance updatedAt (the existing schema-free token
      // version) and immediately close authenticated sockets for this account.
      disconnectUserSockets(user.id);
    } else {
      // Keeper names are profile data, not authentication identity. Preserve the
      // security version while changing name/alternativeNames so active cashiers
      // and their Socket.IO connection remain valid. The timestamp compare avoids
      // overwriting a concurrent password/role/branch/status change.
      const existing = await prisma.user.findUnique({
        where: { id: req.params.id },
        select: { updatedAt: true },
      });
      if (!existing) return void res.status(404).json({ error: "User not found" });
      const update = await prisma.user.updateMany({
        where: { id: req.params.id, updatedAt: existing.updatedAt },
        data: { ...updateData, updatedAt: existing.updatedAt },
      });
      if (update.count !== 1) {
        return void res.status(409).json({ error: "Data akun berubah bersamaan. Muat ulang lalu coba lagi." });
      }
      user = await prisma.user.findUniqueOrThrow({ where: { id: req.params.id } });
    }
    const { password: _, ...userWithoutPassword } = user;
    res.json(userWithoutPassword);
  } catch (error) {
    console.error("User Update Error:", error);
    res.status(500).json({ error: "Gagal update data user. Pastikan data valid." });
  }
});

app.delete("/api/users/:id", authenticateToken, async (req, res) => {
  if ((req as any).user.role !== "ADMIN") return void res.status(403).json({ error: "Forbidden" });
  const targetId = req.params.id;
  // Prevent self-deletion — admin cannot lock themselves out.
  if ((req as any).user.userId === targetId) {
    return void res.status(400).json({ error: "Tidak bisa menghapus akun Anda sendiri." });
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
      return void res.status(400).json({
        error: `Karyawan tidak dapat dihapus karena memiliki riwayat operasional (${salesCount} penjualan, ${shiftsCount} shift, ${commissionsCount} komisi). Nonaktifkan akun dengan mengubah status menjadi "Inactive" untuk mencabut akses tanpa menghapus riwayat.`
      });
    }
    await prisma.user.delete({ where: { id: targetId } });
    disconnectUserSockets(targetId);
    res.json({ success: true });
  } catch (error) {
    console.error("Delete User Error:", error);
    res.status(500).json({ error: "Gagal menghapus karyawan." });
  }
});

app.post("/api/transactions/:id/refund", authenticateToken, requireRole("CASHIER"), async (req, res) => {
  try {
    const requester = (req as any).user;
    const refundTarget = await prisma.sale.findUnique({ where: { id: req.params.id }, select: { branchId: true } });
    if (!refundTarget) return void res.status(404).json({ error: "Transaksi tidak ditemukan." });
    // Cashiers may only refund sales belonging to their own branch.
    if (requester.role === "CASHIER") {
      if (refundTarget.branchId !== requester.branchId) {
        return void res.status(403).json({ error: "Kasir hanya dapat me-refund transaksi cabangnya sendiri." });
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

    const safeResult = redactSaleCosts(result as Record<string, unknown>, requester.role);
    emitBranch((result as any).branchId, "saleUpdated", safeResult);
    emitBranch((result as any).branchId, "commissionsUpdated", { branchId: (result as any).branchId });
    res.json(safeResult);
  } catch (error: any) {
    if (error instanceof ShiftConflict) return void res.status(error.status).json({ error: error.message });
    console.error("Refund Sale Error:", error);
    res.status(500).json({ error: error.message || "Failed to refund sale" });
  }
});

app.post("/api/incentives/withdraw", authenticateToken, requireRole("ADMIN"), async (req, res) => {
  const { branchId } = req.body;
  if (!branchId || typeof branchId !== "string") {
    return void res.status(400).json({ error: "branchId wajib diisi." });
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
    const branchWhere: any = {};
    // Branch isolation: CASHIER is always scoped to their own branch and cannot
    // request other branches or global totals. ADMIN/AUDIT may filter by branch.
    if (user.role === "CASHIER") {
      branchWhere.branchId = user.branchId;
    } else if (branchId) {
      branchWhere.branchId = branchId as string;
    }

    const [earnedTotal, grouped] = await Promise.all([
      prisma.commission.aggregate({
        where: { ...branchWhere, status: "earned" },
        _sum: { amount: true },
      }),
      prisma.commission.groupBy({
        by: ["branchId", "status"],
        where: branchWhere,
        _sum: { amount: true },
      }),
    ]);
    const byBranch: Record<string, number> = {};
    const byBranchStatus: Record<string, { earned: number; withdrawn: number; refunded: number }> = {};
    for (const row of grouped) {
      const amount = Number(row._sum.amount ?? 0);
      const branchTotals = byBranchStatus[row.branchId] ??= { earned: 0, withdrawn: 0, refunded: 0 };
      if (row.status === "earned" || row.status === "withdrawn" || row.status === "refunded") {
        branchTotals[row.status] = amount;
      }
      if (row.status === "earned") byBranch[row.branchId] = amount;
    }
    res.json({
      total: Number(earnedTotal._sum.amount ?? 0),
      byBranch,
      byBranchStatus,
    });
  } catch (error) {
    res.status(500).json({ error: "Failed to fetch commission summary" });
  }
});

app.post("/api/adjustments/cleanup", authenticateToken, async (req, res) => {
  if ((req as any).user.role !== "ADMIN") return void res.status(403).json({ error: "Forbidden" });
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
registerStockAuditRoutes(app, prisma, authenticateToken, requireRole, emitBranch);
registerProductLifecycleRoutes(
  app,
  prisma,
  authenticateToken,
  requireRole,
  (product) => io.emit("productUpdated", productUpdatedPayload(product)),
);

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
      startApiMemoryDiagnostics();
      console.log(`Server running on http://localhost:${PORT}; database and schema ready; automatic maintenance disabled.`);
      resolve();
    });
  }));
}

startServer().catch(async () => {
  console.error("API startup refused: database unavailable or incompatible. No automatic repair performed.");
  try { await prisma.$disconnect(); } finally { process.exit(1); }
});

