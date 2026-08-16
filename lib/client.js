// dsh-vox — 输入框语音识别模块（client bundle，__ModuleLoader__ 格式）
// 功能：在 composer 工具行加号（attach）旁的 `conversation.input.left` 槽位
// 渲染一个水平按钮盒：麦克风按钮（浏览器 Web Speech API 听写，结果实时写入
// 输入框草稿）+ “识别结束自动发送”开关。盒子是 flex 行，后续加按钮只需往
// 容器里再塞一个 <button>。
window.__ModuleLoader__.load({
	id: "dsh-vox",
	factory: (require) => {
		var module = { exports: {} };
		var exports = module.exports;
		const React = require("react");
		// 平台静态模块：发送图标与内置图标同源。
		const primitives = require("@deepseek-ai/dsh-client-ui-primitives");
		const IconSendOutline16 = primitives.IconSendOutline16;

		// ------------------------------------------------------------------
		// 样式（包私有；卸载时随插件 fiber 清理）
		// ------------------------------------------------------------------
		const VOICE_CSS = [
			".dsh-vox-box{display:flex;flex-direction:row;align-items:center;gap:2px;padding:0 2px}",
			".dsh-vox-btn{display:inline-flex;align-items:center;justify-content:center;width:26px;height:26px;padding:0;border:none;border-radius:6px;background:transparent;color:var(--dsw-alias-label-secondary);cursor:pointer;transition:color .15s ease,background-color .15s ease}",
			".dsh-vox-btn:hover:not(:disabled){color:var(--dsw-alias-label-primary);background:var(--dsw-alias-interactive-bg-hover)}",
			".dsh-vox-btn:disabled{opacity:.4;cursor:not-allowed}",
			".dsh-vox-btn.dsh-vox-on{color:var(--dsw-alias-brand-primary)}",
			".dsh-vox-btn.dsh-vox-recording{color:var(--dsw-alias-state-error-primary)}",
			".dsh-vox-btn.dsh-vox-recording svg{animation:dsh-vox-pulse 1.1s ease-in-out infinite}",
			"@keyframes dsh-vox-pulse{0%,100%{opacity:1}50%{opacity:.4}}",
		].join("");

		function voxSvg(children) {
			return React.createElement("svg", {
				width: 15,
				height: 15,
				viewBox: "0 0 24 24",
				fill: "none",
				stroke: "currentColor",
				strokeWidth: 2,
				strokeLinecap: "round",
				strokeLinejoin: "round",
			}, children);
		}

		function voxMicIcon() {
			return voxSvg([
				React.createElement("path", { key: "p1", d: "M12 2a3 3 0 0 1 3 3v6a3 3 0 0 1-6 0V5a3 3 0 0 1 3-3z" }),
				React.createElement("path", { key: "p2", d: "M19 10v1a7 7 0 0 1-14 0v-1" }),
				React.createElement("line", { key: "l1", x1: 12, y1: 19, x2: 12, y2: 22 }),
			]);
		}

		function voxStopIcon() {
			return React.createElement("svg", { width: 15, height: 15, viewBox: "0 0 24 24", fill: "currentColor" },
				React.createElement("rect", { x: 6, y: 6, width: 12, height: 12, rx: 2 }));
		}

		// ------------------------------------------------------------------
		// 按钮盒组件。props 来自 conversation.input.left 的槽位契约：
		//   props.input        —— InputState 点快照（input.draft 为当前草稿）
		//   props.inputActions —— { setDraft(text), submit(), ... }
		// ------------------------------------------------------------------
		function VoiceToolBox(props) {
			const actions = props.inputActions || null;
			const draft = props.input && typeof props.input.draft === "string" ? props.input.draft : "";

			const [support, setSupport] = React.useState("checking"); // checking | ok | no
			const [engine, setEngine] = React.useState(null);
			const [running, setRunning] = React.useState(false);
			const [baseDraft, setBaseDraft] = React.useState("");
			const [finals, setFinals] = React.useState("");
			const [interim, setInterim] = React.useState("");
			const [stopAsked, setStopAsked] = React.useState(false);
			const [autoSend, setAutoSend] = React.useState(false);
			const [error, setError] = React.useState("");

			// 一次性能力检测（Web Speech API）
			React.useEffect(() => {
				let SR = null;
				try {
					SR = window.SpeechRecognition || window.webkitSpeechRecognition;
				} catch (e) {
					SR = null;
				}
				setSupport(SR ? "ok" : "no");
				return () => {};
			}, []);

			// 听写进行中：把 基准草稿 + 已确认文本 + 中间结果 实时写回输入框
			React.useEffect(() => {
				if (!running) return;
				if (!actions || typeof actions.setDraft !== "function") return;
				const sep = baseDraft && !/[\s\u3000]$/.test(baseDraft) ? " " : "";
				actions.setDraft(baseDraft + sep + finals + interim);
			}, [running, baseDraft, finals, interim]);

			// 用户主动停止后：若开了自动发送且有识别内容，则提交
			React.useEffect(() => {
				if (running || !stopAsked) return;
				setStopAsked(false);
				const text = (finals + interim).trim();
				if (autoSend && actions && typeof actions.submit === "function" && text) {
					actions.submit();
				}
			}, [running, stopAsked, autoSend, finals, interim]);

			// 组件卸载（切换会话）时中止识别，避免后台一直听
			React.useEffect(() => {
				if (!engine) return () => {};
				return () => {
					try {
						engine.onend = null;
						engine.onerror = null;
						engine.onresult = null;
						engine.abort();
					} catch (e) {
						/* 已结束的识别引擎无需处理 */
					}
				};
			}, [engine]);

			const startListening = () => {
				if (running || support !== "ok") return;
				let SR = null;
				try {
					SR = window.SpeechRecognition || window.webkitSpeechRecognition;
				} catch (e) {
					SR = null;
				}
				if (!SR) {
					setSupport("no");
					return;
				}
				try {
					const rec = new SR();
					rec.lang = "zh-CN";
					rec.continuous = true;
					rec.interimResults = true;
					rec.maxAlternatives = 1;
					rec.onresult = (event) => {
						let added = "";
						let inter = "";
						for (let i = event.resultIndex; i < event.results.length; i++) {
							const res = event.results[i];
							const alt = res && res[0] ? res[0].transcript : "";
							if (res.isFinal) added += alt;
							else inter += alt;
						}
						if (added) setFinals((prev) => prev + added);
						setInterim(inter);
					};
					rec.onerror = (event) => {
						const code = event && event.error ? event.error : "unknown";
						setError(
							code === "not-allowed" || code === "service-not-allowed"
								? "麦克风权限被拒绝，请在浏览器里允许后重试"
								: "语音识别出错：" + code
						);
						setRunning(false);
						console.error("[dsh-vox] recognition error:", code);
					};
					rec.onend = () => {
						setRunning(false);
					};
					setEngine(rec);
					setBaseDraft(draft);
					setFinals("");
					setInterim("");
					setStopAsked(false);
					setError("");
					rec.start();
					setRunning(true);
				} catch (e) {
					setError("无法启动语音识别：" + (e && e.message ? e.message : String(e)));
					console.error("[dsh-vox] start failed:", e);
				}
			};

			const stopListening = () => {
				if (!running) return;
				setStopAsked(true);
				if (engine) {
					try {
						engine.stop();
					} catch (e) {
						setRunning(false);
					}
				}
			};

			const micTitle = running
				? "停止语音输入"
				: support === "no"
					? "当前浏览器不支持语音识别（推荐 Chrome / Edge）"
					: error || "语音输入";

			// 横向按钮盒：以后要加新按钮，往这个容器里再加一个 button 即可
			return React.createElement("div", { className: "dsh-vox-box" },
				React.createElement("button", {
					type: "button",
					className: "dsh-vox-btn" + (running ? " dsh-vox-recording" : ""),
					title: micTitle,
					disabled: support !== "ok",
					onClick: running ? stopListening : startListening,
					"aria-label": "语音输入",
				}, running ? voxStopIcon() : voxMicIcon()),
				React.createElement("button", {
					type: "button",
					className: "dsh-vox-btn" + (autoSend ? " dsh-vox-on" : ""),
					title: autoSend ? "识别结束自动发送：开" : "识别结束自动发送：关",
					disabled: support !== "ok",
					onClick: () => setAutoSend((v) => !v),
					"aria-label": "识别结束自动发送",
					"aria-pressed": autoSend,
				}, React.createElement(IconSendOutline16, { size: 15 })),
			);
		}

		// ------------------------------------------------------------------
		// 插件入口
		// ------------------------------------------------------------------
		const inject = ["slots"];

		function apply(ctx) {
			const styleEl = document.createElement("style");
			styleEl.dataset.plugin = "dsh-vox";
			styleEl.dataset.pluginCss = "dsh-vox/voice.css";
			styleEl.textContent = VOICE_CSS;
			document.head.append(styleEl);
			ctx.effect(() => () => styleEl.remove());

			const slots = ctx.slots;
			if (slots !== undefined) {
				slots.inject("conversation.input.left", () => slots.register(
					{ name: "conversation.input.left", id: "dsh-vox-toolbox", order: 10 },
					VoiceToolBox,
				));
			}
		}

		exports.apply = apply;
		exports.inject = inject;
		return module.exports;
	},
});
