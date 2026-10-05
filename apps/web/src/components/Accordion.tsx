/** Mục điều hướng bung/thu — phiên bản nền tối cho thanh bên slate-900. */

import { AnimatePresence, motion } from 'motion/react';
import { ChevronDown } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';

export function Accordion({
  mo,
  onToggle,
  tieu_de,
  icon: Icon,
  dang_chon = false,
  children,
}: {
  mo: boolean;
  onToggle: () => void;
  tieu_de: string;
  icon: LucideIcon;
  dang_chon?: boolean;
  children: ReactNode;
}) {
  return (
    <div className="flex flex-col w-full">
      <button
        onClick={onToggle}
        className={`w-full flex items-center justify-between gap-3 px-3.5 py-2.5 rounded-xl text-xs font-semibold tracking-wide uppercase transition-all duration-200 text-left cursor-pointer ${
          dang_chon
            ? 'text-white bg-slate-800/70'
            : 'text-slate-400 hover:text-white hover:bg-slate-800/60'
        }`}
      >
        <div className="flex items-center gap-3 min-w-0">
          <Icon
            className={`w-4.5 h-4.5 shrink-0 ${dang_chon ? 'text-sky-400' : 'text-slate-500'}`}
          />
          <span className="truncate">{tieu_de}</span>
        </div>
        <ChevronDown
          className={`w-4 h-4 transition-transform duration-200 shrink-0 ${
            mo ? 'rotate-180' : ''
          } ${dang_chon ? 'text-sky-400/80' : 'text-slate-500'}`}
        />
      </button>

      <AnimatePresence initial={false}>
        {mo && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{
              height: 'auto',
              opacity: 1,
              transition: {
                height: { duration: 0.25, ease: 'easeOut' },
                opacity: { duration: 0.2, ease: 'easeOut' },
              },
            }}
            exit={{
              height: 0,
              opacity: 0,
              transition: {
                height: { duration: 0.2, ease: 'easeIn' },
                opacity: { duration: 0.15, ease: 'easeIn' },
              },
            }}
            className="overflow-hidden"
          >
            <div className="ml-7 border-l border-slate-700/70 pl-3 py-1 my-1 flex flex-col gap-1">
              {children}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
