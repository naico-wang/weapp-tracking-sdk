import { terser } from "rollup-plugin-terser";
import resolve from '@rollup/plugin-node-resolve';
import commonjs from '@rollup/plugin-commonjs';

export default {
  input: 'src/index.js',
  output: [
    {
      file: 'dist/index.cjs.js',
      format: 'cjs',
      sourcemap: 'true',
      exports: 'auto'
    },
    {
      file: 'dist/index.esm.js',
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
