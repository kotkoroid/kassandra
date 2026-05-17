/// <reference types="vite/client" />

declare module '*.css';
declare module '*.jsonc?raw' {
  const content: string;
  export default content;
}
