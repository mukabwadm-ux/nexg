export interface HistorySection {
  label: string;
  headers: string[];
  rows: Array<{id:string;cells:string[]}>;
  empty: string;
  note?: string;
}

export interface HostHistory {
  metrics: Array<{label:string;value:string;note:string}>;
  sections: HistorySection[];
}
