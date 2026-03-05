export type ReportFailure = {
  id: string;
  message: string;
  path?: string;
  hint?: string;
  evidence?: string;
  fix?: string;
};

export type ReportWarning = {
  id: string;
  message: string;
};

export type VerifyReport = {
  ok: boolean;
  summary: {
    failures: number;
    warnings: number;
    baseRef?: string;
    baseSha?: string;
  };
  failures: ReportFailure[];
  warnings: ReportWarning[];
};
