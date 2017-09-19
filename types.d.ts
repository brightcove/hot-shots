declare module "hot-shots" {
  export interface ClientOptions {
    host?: string;
    port?: number;
    prefix?: string;
    suffix?: string;
    globalize?: boolean;
    cacheDns?: boolean;
    mock?: boolean;
    globalTags?: string[];
    maxBufferSize?: number;
    bufferFlushInterval?: number;
    telegraf?: boolean;
    sampleRate?: number;
    errorHandler?: (err: Error) => void;
  }

  export interface CheckOptions {
    date_happened?: Date;
    hostname?: string;
    message?: string;
  }

  export interface DatadogChecks {
    OK: 0;
    WARNING: 1;
    CRITICAL: 2;
    UNKNOWN: 3;
  }

  type unionFromInterfaceValues4<
    T,
    K1 extends keyof T,
    K2 extends keyof T,
    K3 extends keyof T,
    K4 extends keyof T,
  > = T[K1] | T[K2] | T[K3] | T[K4];

  export type DatadogChecksValues = unionFromInterfaceValues4<DatadogChecks, "OK", "WARNING", "CRITICAL", "UNKNOWN">;

  export interface EventOptions {
    aggregation_key?: string;
    alert_type?: "info" | "warning" | "success" | "error";
    date_happened?: Date;
    hostname?: string;
    priority?: "low" | "normal";
    source_type_name?: string;
  }

  export type StatsCb = (error: Error | undefined, bytes: any) => void;
  export type StatsCall = (stat: string | string[], value: number, sampleRate?: number, tags?: string[], callback?: StatsCb) => void;

  export class StatsD {
    constructor(options?: ClientOptions);
    increment(stat: string): void;
    increment(stat: string | string[], value: number, sampleRate?: number, tags?: string[], callback?: StatsCb): void;

    decrement(stat: string): void;
    decrement(stat: string | string[], value: number, sampleRate?: number, tags?: string[], callback?: StatsCb): void;

    timing(stat: string | string[], value: number, sampleRate?: number, tags?: string[], callback?: StatsCb): void;
    histogram(stat: string | string[], value: number, sampleRate?: number, tags?: string[], callback?: StatsCb): void;
    gauge(stat: string | string[], value: number, sampleRate?: number, tags?: string[], callback?: StatsCb): void;
    set(stat: string | string[], value: number, sampleRate?: number, tags?: string[], callback?: StatsCb): void;
    unique(stat: string | string[], value: number, sampleRate?: number, tags?: string[], callback?: StatsCb): void;

    close(callback: () => void): void;

    event(title: string, text?: string, options?: EventOptions, tags?: string[], callback?: StatsCb): void;
    check(name: string, status: DatadogChecksValues, options?: CheckOptions, tags?: string[], callback?: StatsCb): void;

    public CHECKS: DatadogChecks;
  }
}
