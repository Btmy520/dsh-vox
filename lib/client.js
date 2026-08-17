// dsh-vox — 本地 Whisper 流式语音输入模块（client bundle，__ModuleLoader__ 格式）
// 在 composer 工具行加号（attach）旁的 `conversation.input.left` 槽位渲染按钮盒：
//   🎤 麦克风 —— 点一下开始录音（MediaRecorder），录音期间每 5 秒把已录内容
//               送到 Host 用本地 whisper-cli（-l auto）识别一次，文本实时写入
//               输入框草稿；再点停止，做最后一遍全量识别精修后收尾。
window.__ModuleLoader__.load({
	id: "dsh-vox",
	factory: (require) => {
		var module = { exports: {} };
		var exports = module.exports;
		const React = require("react");

		// ------------------------------------------------------------------
		// 样式（包私有；卸载时随插件 fiber 清理）
		// ------------------------------------------------------------------
		const VOICE_CSS = [
			".dsh-vox-box{display:flex;flex-direction:row;align-items:center;gap:2px;padding:0 2px}",
			".dsh-vox-btn{display:inline-flex;align-items:center;justify-content:center;width:26px;height:26px;padding:0;border:none;border-radius:6px;background:transparent;color:var(--dsw-alias-label-secondary);cursor:pointer;transition:color .15s ease,background-color .15s ease}",
			".dsh-vox-btn:hover:not(:disabled){color:var(--dsw-alias-label-primary);background:var(--dsw-alias-interactive-bg-hover)}",
			".dsh-vox-btn:disabled{opacity:.4;cursor:not-allowed}",
			".dsh-vox-btn.dsh-vox-recording{color:var(--dsw-alias-state-error-primary)}",
			".dsh-vox-btn.dsh-vox-recording svg{animation:dsh-vox-pulse 1.1s ease-in-out infinite}",
			".dsh-vox-btn.dsh-vox-busy{color:var(--dsw-alias-brand-primary);cursor:progress}",
			".dsh-vox-busy svg{animation:dsh-vox-spin 1s linear infinite}",
			"@keyframes dsh-vox-pulse{0%,100%{opacity:1}50%{opacity:.4}}",
			"@keyframes dsh-vox-spin{to{transform:rotate(360deg)}}",
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

		function voxBusyIcon() {
			return voxSvg([React.createElement("path", { key: "p", d: "M12 3a9 9 0 1 0 9 9" })]);
		}

		function blobToBase64(blob) {
			return new Promise((resolve, reject) => {
				const reader = new FileReader();
				reader.onload = () => {
					const value = typeof reader.result === "string" ? reader.result : "";
					const comma = value.indexOf(",");
					resolve(comma === -1 ? value : value.slice(comma + 1));
				};
				reader.onerror = () => reject(new Error("读取录音失败"));
				reader.readAsDataURL(blob);
			});
		}

		// ------------------------------------------------------------------
		// 按钮盒组件。props 来自 conversation.input.left 的槽位契约：
		//   props.input        —— InputState 点快照（input.draft 为当前草稿）
		//   props.inputActions —— { setDraft(text), submit(), ... }
		// 录音设备、基准草稿、定时器等会话真相放在 useRef 里，
		// 定时器与识别回调永远读到最新值（无 stale closure）。
		// ------------------------------------------------------------------
		function VoiceToolBox(props) {
			const actions = props.inputActions || null;
			const draft = props.input && typeof props.input.draft === "string" ? props.input.draft : "";

			const [phase, setPhase] = React.useState("idle"); // idle | recording | transcribing
			const [error, setError] = React.useState("");
			const [tip, setTip] = React.useState("");
			const s = React.useRef({
				stream: null,
				recorder: null,
				chunks: [],
				timer: null,
				inFlight: false,
				base: "",
				live: "",
			});

			const cleanup = () => {
				const st = s.current;
				if (st.timer !== null) {
					clearInterval(st.timer);
					st.timer = null;
				}
				if (st.recorder && st.recorder.state !== "inactive") {
					try { st.recorder.stop(); } catch (e) { /* 已停 */ }
				}
				if (st.stream) {
					st.stream.getTracks().forEach((track) => track.stop());
				}
				st.recorder = null;
				st.stream = null;
				st.chunks = [];
			};

			// 组件卸载（切换会话）时释放麦克风
			React.useEffect(() => () => cleanup(), []);

			const postAudio = async (blob) => {
				const base64 = await blobToBase64(blob);
				const resp = await fetch("/plugins/dsh-vox/transcribe", {
					method: "POST",
					headers: { "Content-Type": "application/json" },
					body: JSON.stringify({ name: "voice.webm", data: base64 }),
				});
				const json = await resp.json().catch(() => null);
				if (!resp.ok || json === null || !json.ok) {
					throw new Error(json && json.error ? json.error : "识别失败 HTTP " + resp.status);
				}
				return (json.text || "").trim();
			};

			// 把识别文本写进草稿：基准草稿 + 空格 + 最新识别文本
			const syncDraft = (text) => {
				if (!actions || typeof actions.setDraft !== "function") return;
				const st = s.current;
				const sep = st.base && !/[\s\u3000]$/.test(st.base) ? " " : "";
				actions.setDraft(st.base + sep + text);
			};

			// 流式 tick：把「目前录到的所有音频」送去识别，替换草稿里的语音部分
			const tick = async () => {
				const st = s.current;
				if (st.inFlight || st.recorder === null || st.recorder.state === "inactive") return;
				if (st.chunks.length === 0) return;
				st.inFlight = true;
				try {
					const blob = new Blob(st.chunks.slice(), { type: st.recorder.mimeType || "audio/webm" });
					const text = await postAudio(blob);
					if (st.recorder !== null && st.recorder.state !== "inactive") {
						st.live = text;
						syncDraft(text);
						setTip("流式识别中…");
					}
				} catch (err) {
					// 中间一轮失败不打断录音，下一轮会带更多音频重试
					console.error("[dsh-vox] interim transcribe failed:", err);
				} finally {
					st.inFlight = false;
				}
			};

			const startRecording = async () => {
				if (phase !== "idle") return;
				setError("");
				setTip("");
				let stream = null;
				try {
					stream = await navigator.mediaDevices.getUserMedia({ audio: true });
				} catch (e) {
					setError("麦克风权限被拒绝，请在浏览器里允许后重试");
					return;
				}
				let recorder = null;
				const mime = window.MediaRecorder && MediaRecorder.isTypeSupported("audio/webm;codecs=opus")
					? "audio/webm;codecs=opus"
					: "";
				try {
					recorder = mime === "" ? new MediaRecorder(stream) : new MediaRecorder(stream, { mimeType: mime });
				} catch (e) {
					recorder = new MediaRecorder(stream);
				}
				const st = s.current;
				st.stream = stream;
				st.recorder = recorder;
				st.chunks = [];
				st.base = draft;
				st.live = "";
				st.inFlight = false;
				recorder.ondataavailable = (event) => {
					if (event.data && event.data.size > 0) s.current.chunks.push(event.data);
				};
				recorder.start(250);
				st.timer = window.setInterval(() => {
					tick();
				}, 5000);
				setPhase("recording");
			};

			const stopAndFinalize = async () => {
				if (phase !== "recording") return;
				const st = s.current;
				if (st.timer !== null) {
					clearInterval(st.timer);
					st.timer = null;
				}
				const recorder = st.recorder;
				if (!recorder) return;
				const stopped = new Promise((resolve) => {
					recorder.onstop = resolve;
				});
				try {
					recorder.stop();
				} catch (e) {
					cleanup();
					setPhase("idle");
					return;
				}
				await stopped;
				if (st.stream) {
					st.stream.getTracks().forEach((track) => track.stop());
					st.stream = null;
				}
				const blob = new Blob(st.chunks.slice(), { type: recorder.mimeType || "audio/webm" });
				st.chunks = [];
				st.recorder = null;
				if (blob.size < 1500) {
					setPhase("idle");
					return; // 太短的录音直接忽略
				}
				setPhase("transcribing");
				setTip("最终识别中…");
				try {
					const text = await postAudio(blob);
					if (text === "") throw new Error("没有识别到内容，重说一遍试试");
					st.live = text;
					syncDraft(text);
					setTip("识别完成");
				} catch (err) {
					setError(err && err.message ? err.message : String(err));
					console.error("[dsh-vox] transcribe failed:", err);
				} finally {
					setPhase("idle");
				}
			};

			const onMicClick = () => {
				if (phase === "recording") stopAndFinalize();
				else if (phase === "idle") startRecording();
			};

			const micTitle =
				phase === "transcribing"
					? "最终识别中…"
					: phase === "recording"
						? "停止语音输入（流式识别中）"
						: error || tip || "语音输入（本地 Whisper，流式，自动识别中英文）";

			// 横向按钮盒：以后要加新按钮，往这个容器里再加一个 button 即可
			return React.createElement("div", { className: "dsh-vox-box" },
				React.createElement("button", {
					type: "button",
					className: "dsh-vox-btn" + (phase === "recording" ? " dsh-vox-recording" : "") + (phase === "transcribing" ? " dsh-vox-busy" : ""),
					title: micTitle,
					disabled: phase === "transcribing",
					onClick: onMicClick,
					"aria-label": "语音输入",
				}, phase === "transcribing" ? voxBusyIcon() : phase === "recording" ? voxStopIcon() : voxMicIcon()),
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
