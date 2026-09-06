import { defineConfig } from 'vitest/config'

export default defineConfig({
  resolve: { tsconfigPaths: true },
  test: {
    include: ['src/**/__tests__/**/*.test.ts'],
    // Sin jsdom: solo probamos funciones puras del engine.
    // Ninguna prueba debe conectarse a Supabase u otros servicios reales.
  },
})
