/// <reference types="vite/client" />
declare const __BUILD__: 'BASIC' | 'FULL';
declare module 'virtual:rrl-inline-assets' {
  const map: Record<string, string>;
  export default map;
}
