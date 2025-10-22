/// <reference types="vite/client" />

declare module "vite/client" {
  interface ImportMetaEnv {
    readonly [key: string]: string | boolean | number | undefined;
  }

  interface ImportMeta {
    readonly env: ImportMetaEnv;
  }
}
