import { terser } from "rollup-plugin-terser";
import resolve from '@rollup/plugin-node-resolve';
import commonjs from '@rollup/plugin-commonjs';

export default {
  input: 'src/index.js',
  output: [
    {
      file: 'dist/tracking.cjs.js',
      format: 'cjs',
      sourcemap: 'true',
      exports: 'auto'
    },
    {
      file: 'dist/tracking.esm.js',
      format: 'esm',
      sourcemap: 'true'
    },
    {
      file: 'miniprogram/tracking.js',
      format: 'esm',
      sourcemap: 'true'
    }
  ],
  plugins: [
    resolve(),
    commonjs(),
    terser()
  ]
};
