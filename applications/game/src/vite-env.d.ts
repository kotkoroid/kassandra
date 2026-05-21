/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_REALM_URL: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

declare module '*.css';
declare module '*.jsonc?raw' {
  const content: string;
  export default content;
}
