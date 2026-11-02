import { Check } from 'lucide-react';

/** Read-only progress: changing a step is a workflow action, not navigation. */
export function WorkSteps({ stages, current }: { stages: string[]; current: number }) {
  return (
    <ol aria-label="Work progress" className="my-2 flex w-full items-start overflow-x-auto pb-1">
      {stages.map((stage, index) => {
        const completed = index < current;
        const active = index === current;
        return (
          <li key={`${stage}-${index}`} aria-current={active ? 'step' : undefined} className="relative min-w-[3.7rem] flex-1 text-center">
            {index < stages.length - 1 && <span aria-hidden="true" className={`absolute left-1/2 top-[10px] h-0.5 w-full ${completed ? 'bg-[#bd9343]' : 'bg-[#d9dce0]'}`} />}
            <span aria-hidden="true" className={`relative z-10 mx-auto flex h-[22px] w-[22px] items-center justify-center rounded-full border-2 text-[10px] font-bold ${completed || active ? 'border-[#b58a38] bg-[#b58a38] text-white' : 'border-[#c8cbd0] bg-white text-[#7a8490]'}`}>
              {completed ? <Check size={12} /> : index + 1}
            </span>
            <span className={`mt-1 block px-0.5 text-[11px] leading-4 ${active ? 'font-bold text-[#1d2c40]' : 'text-[#687585]'}`}>{stage}</span>
            <span className="sr-only">{completed ? ', completed' : active ? ', current' : ', upcoming'}</span>
          </li>
        );
      })}
    </ol>
  );
}
