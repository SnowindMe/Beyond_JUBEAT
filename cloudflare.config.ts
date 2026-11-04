import { bindings, defineConfig, triggers } from "cf/config";

/**
 * Secret-like files were detected but not read or migrated: archive\legacy\jubeat-wiki-v2\.vercel\.env.production.local, archive\legacy\jubeat-wiki-v3\.dev.vars, archive\legacy\jubeat-wiki-v3\dist\server\.dev.vars. Only `secrets.required` entries are migrated.
 * @see https://developers.cloudflare.com/workers/configuration/secrets/
 */

/* 迁移完成：原本这里有一条 throw 挡着。
   assets.directory 那条 TODO 不需要字段——本项目是 Astro + Vite，
   静态资源目录（public/ → dist/client）由 Vite 侧决定，cf 的 assets 配置只留处理策略。 */

export default defineConfig({
	worker: {
		name: "beyond-jubeat",
		compatibilityDate: "2025-09-24",
		compatibilityFlags: [
			"nodejs_compat",
		],
		entrypoint: "src/worker.ts",
		observability: {
			enabled: true,
			logs: {
				enabled: true,
				headSamplingRate: 1,
				invocationLogs: true,
				persist: true,
			},
			traces: {
				enabled: false,
				headSamplingRate: 1,
				persist: true,
			},
			issues: {
				enabled: false,
			},
		},
		assets: {
			notFoundHandling: "404-page",
			runWorkerFirst: [
				"/",
				"/songs",
				"/songs/*",
				"/jubility",
				"/jubility/*",
				"/login",
				"/login/*",
				"/register",
				"/register/*",
				"/account",
				"/account/*",
				"/admin",
				"/admin/*",
				"/recent",
				"/recent/*",
				"/api/*",
			],
		},
		triggers: [
			triggers.scheduled({
				schedule: "5 16 * * *",
			}),
		],
		env: {
			beyond_jubeat: bindings.d1({
				name: "beyond-jubeat",
				id: "91a48a18-62b2-4933-9214-788205926744",
			}),
			SESSION: bindings.kv({
				id: "65d684992b4041c6af8b34451a0393c1",
			}),
			ASSETS: bindings.assets(),
		},
	},
});
