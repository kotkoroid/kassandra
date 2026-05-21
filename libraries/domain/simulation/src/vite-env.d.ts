// Type declarations for Vite's `?raw` import suffix.
// The library is built/consumed via Vite on the client; this stub
// satisfies the TypeScript compiler when it checks the library in
// isolation (e.g. through the nx types:check target).
declare module '*?raw' {
  const content: string;
  export default content;
}
