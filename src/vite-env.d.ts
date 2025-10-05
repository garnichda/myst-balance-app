/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_ALCHEMY_API_KEY: string;
  readonly VITE_MYST_TOKEN_ADDRESS: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
