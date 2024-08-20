import globals from 'globals';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import js from '@eslint/js';
import { FlatCompat } from '@eslint/eslintrc';
import { fixupConfigRules } from '@eslint/compat';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const compat = new FlatCompat({
	baseDirectory: __dirname,
	recommendedConfig: js.configs.recommended,
	allConfig: js.configs.all,
});

export default [
	{
		ignores: [
			'**/eslint*',
			'out/**',
			'scripts/**',
			'coverage/**',
			'walkthroughs/**',
			'*.config.js',
			'patches/**',
			'node_modules/**',
			'dist/**',
			'images/**',
			'.vscode/**',
			'.github/**',
			'.wdio-vscode-service/**',
			'esbuild.mjs',
			'src/test/**',
		],
	},
	...fixupConfigRules(compat.extends('.eslintrc.base.json', 'plugin:lit/recommended', 'plugin:wc/recommended')),
	{
		ignores: ['src/**/__tests__/*.test.ts', 'src/env/browser/*', 'src/test/suite/**', 'src/webviews/apps/**/*'],
		files: ['src/**'],
		languageOptions: {
			globals: {
				...globals.node,
			},

			ecmaVersion: 5,
			sourceType: 'commonjs',

			parserOptions: {
				project: 'tsconfig.json',
			},
		},
	},
	{
		files: ['src/**/__tests__/*.test.ts', 'src/test/suite/**', 'src/env/browser/**'],
		languageOptions: {
			globals: {
				...globals.node,
			},
			parserOptions: {
				project: 'tsconfig.test.json',
			},
		},
		rules: {
			'no-restricted-imports': 'off',
			'@typescript-eslint/no-unused-vars': 'off',
			'no-restricted-syntax': [
				'error',
				{
					message: "Don't forget to remove .only from test suites",
					selector: 'CallExpression MemberExpression[object.name="suite"][property.name="only"]',
				},
				{
					message: "Don't forget to remove .only from tests",
					selector: 'CallExpression MemberExpression[object.name="test"][property.name="only"]',
				},
			],
		},
	},
	{
		files: ['src/env/browser/**'],
		languageOptions: {
			globals: {
				...globals.worker,
			},

			parserOptions: {
				project: 'tsconfig.browser.json',
			},
		},
	},
	{
		files: ['src/webviews/apps/**'],
		languageOptions: {
			globals: {
				...globals.browser,
			},

			ecmaVersion: 5,
			sourceType: 'script',

			parserOptions: {
				project: 'src/webviews/apps/tsconfig.json',
			},
		},

		settings: {
			wc: {
				elementBaseClasses: ['LitElement'],
			},
		},
	},
];
