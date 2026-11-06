import type { ReactNode } from 'react';

type PremiumPageFrameProps = {
  section: string;
  title: string;
  description: string;
  action?: ReactNode;
  children: ReactNode;
};

export function PremiumPageFrame({
  section,
  title,
  description,
  action,
  children,
}: PremiumPageFrameProps) {
  return (
    <main className="premium-page min-h-screen w-full">
      <div className="mx-auto w-full max-w-[1480px] px-4 pb-10 pt-5 sm:px-7 sm:pt-7 lg:px-10 lg:pt-9">
        <header className="mb-6 border-b border-[var(--premium-line)] pb-5 sm:mb-8 sm:pb-6">
          <div className="mb-4 flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.16em] text-[var(--premium-muted)] sm:text-[11px]">
            <span className="grid h-7 w-7 place-items-center rounded-lg bg-[var(--premium-navy)] font-serif text-sm font-bold text-white shadow-[0_4px_12px_rgba(23,43,73,0.18)]">
              A
            </span>
            <span>Alfath Pulsa</span>
            <span className="text-[var(--premium-gold)]">/</span>
            <span className="truncate">{section}</span>
          </div>
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div className="min-w-0">
              <h1 className="text-[23px] font-semibold tracking-[-0.045em] text-[var(--premium-navy)] sm:text-[30px]">
                {title}
              </h1>
              <p className="mt-1.5 max-w-2xl text-[12px] leading-relaxed text-[var(--premium-muted)] sm:text-sm">
                {description}
              </p>
            </div>
            {action && <div className="shrink-0">{action}</div>}
          </div>
        </header>
        {children}
      </div>
    </main>
  );
}
