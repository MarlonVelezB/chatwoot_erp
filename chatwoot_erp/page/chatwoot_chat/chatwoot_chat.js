class ChatwootApp {
	constructor(wrapper) {
		this.wrapper = wrapper;
		this.currentSection = "all";
		this.activeConversation = null;
		this.conversations = [];
		this.pollingInterval = null;
	}

	init() {
		frappe.require([
			"/assets/chatwoot_erp/css/chatwoot_chat.css",
		], () => {});

		$(this.wrapper).find(".page-content").html(
			$(frappe.render_template("chatwoot_chat", {}))
		);

		this._bindSidebar();
		this._bindComposer();
		this._bindSearch();
		this.loadConversations("all");
		this.setupRealtime();
		this.startPolling();
	}

	// ── Sidebar navigation ──────────────────────────────────────────────────

	_bindSidebar() {
		const $wrapper = $(this.wrapper);

		$wrapper.on("click", "[data-section]", (e) => {
			e.preventDefault();
			const section = $(e.currentTarget).data("section");
			this.navigate(section);
		});

		$wrapper.on("click", "#conversations-toggle", () => {
			const $group = $wrapper.find("#conversations-toggle").closest(".cw-nav-group");
			const $children = $wrapper.find("#conversations-children");
			$group.toggleClass("open");
			$children.toggleClass("collapsed");
		});

		// Open conversations group by default
		$wrapper.find(".cw-nav-group").addClass("open");
	}

	navigate(section) {
		const $wrapper = $(this.wrapper);
		$wrapper.find("[data-section]").removeClass("active");
		$wrapper.find(`[data-section="${section}"]`).addClass("active");
		this.currentSection = section;

		const titles = {
			all: "Todas las conversaciones",
			mine: "Mi bandeja de entrada",
			mentions: "Menciones",
			unattended: "Desatendido",
			contacts: "Contactos",
			reports: "Informes",
			campaigns: "Campañas",
			settings: "Ajustes",
		};

		$wrapper.find("#cw-panel-title").text(titles[section] || section);

		const convSections = ["all", "mine", "mentions", "unattended"];
		if (convSections.includes(section)) {
			this.loadConversations(section);
		} else {
			$wrapper.find("#cw-conv-list").html(
				`<div class="cw-empty-state">Sección en construcción</div>`
			);
		}
	}

	// ── Conversations ────────────────────────────────────────────────────────

	loadConversations(filterType) {
		const assigneeMap = { all: "all", mine: "assigned", mentions: "mentioned", unattended: "unattended" };
		const assignee_type = assigneeMap[filterType] || "all";

		frappe.call({
			method: "chatwoot_erp.api.get_conversations",
			args: { filter_type: assignee_type, page: 1 },
			callback: (r) => {
				if (r.exc) return;
				const data = r.message;
				this.conversations = (data && data.data && data.data.payload) || [];
				this._renderConversations(this.conversations);
				this._updateBadge(data);
			},
		});
	}

	_renderConversations(list) {
		const $list = $(this.wrapper).find("#cw-conv-list");

		if (!list.length) {
			$list.html(`<div class="cw-empty-state">Sin conversaciones</div>`);
			return;
		}

		$list.html(list.map((c) => this._convItemHtml(c)).join(""));

		$list.find(".cw-conv-item").on("click", (e) => {
			const id = $(e.currentTarget).data("id");
			this.openConversation(id);
		});
	}

	_convItemHtml(c) {
		const contact = c.meta && c.meta.sender;
		const name = (contact && contact.name) || `#${c.id}`;
		const initials = name.slice(0, 2).toUpperCase();
		const preview = c.last_non_activity_message
			? (c.last_non_activity_message.content || "").slice(0, 60)
			: "";
		const ts = c.last_activity_at
			? _formatTime(c.last_activity_at)
			: "";
		const active = this.activeConversation === c.id ? " active" : "";

		return `<div class="cw-conv-item${active}" data-id="${c.id}">
			<div class="cw-avatar">${initials}</div>
			<div class="cw-conv-info">
				<div class="cw-conv-top">
					<span class="cw-conv-name">${frappe.utils.escape_html(name)}</span>
					<span class="cw-conv-time">${ts}</span>
				</div>
				<div class="cw-conv-preview">${frappe.utils.escape_html(preview)}</div>
			</div>
		</div>`;
	}

	_updateBadge(data) {
		const meta = data && data.data && data.data.meta;
		const count = (meta && meta.mine_count) || 0;
		const $badge = $(this.wrapper).find("#badge-mine");
		if (count > 0) {
			$badge.text(count).addClass("visible");
		} else {
			$badge.removeClass("visible");
		}
	}

	// ── Single conversation ──────────────────────────────────────────────────

	openConversation(id) {
		this.activeConversation = id;

		$(this.wrapper).find(".cw-conv-item").removeClass("active");
		$(this.wrapper).find(`.cw-conv-item[data-id="${id}"]`).addClass("active");

		$(this.wrapper).find("#cw-chat-empty").hide();
		$(this.wrapper).find("#cw-chat-inner").show();

		const conv = this.conversations.find((c) => c.id == id);
		if (conv) this._renderChatHeader(conv);

		frappe.call({
			method: "chatwoot_erp.api.get_messages",
			args: { conversation_id: id },
			callback: (r) => {
				if (r.exc) return;
				const msgs = (r.message && r.message.payload) || [];
				this._renderMessages(msgs);
			},
		});
	}

	_renderChatHeader(conv) {
		const contact = conv.meta && conv.meta.sender;
		const name = (contact && contact.name) || `Conversación #${conv.id}`;
		const initials = name.slice(0, 2).toUpperCase();
		const status = conv.status || "";

		$(this.wrapper).find("#cw-chat-header").html(`
			<div class="cw-avatar">${initials}</div>
			<div>
				<div class="cw-chat-title">${frappe.utils.escape_html(name)}</div>
				<div class="cw-chat-status">${status}</div>
			</div>
		`);
	}

	_renderMessages(msgs) {
		const $container = $(this.wrapper).find("#cw-messages");
		if (!msgs.length) {
			$container.html(`<div class="cw-empty-state">Sin mensajes</div>`);
			return;
		}

		$container.html(msgs.map((m) => {
			const type = m.message_type === 1 ? "outgoing" : m.content_type === "activity" ? "activity" : "incoming";
			const time = m.created_at ? _formatTime(m.created_at) : "";
			const content = frappe.utils.escape_html((m.content || "").trim());
			return `<div class="cw-msg ${type}">
				${content}
				<div class="cw-msg-time">${time}</div>
			</div>`;
		}).join(""));

		$container.scrollTop($container[0].scrollHeight);
	}

	// ── Composer ─────────────────────────────────────────────────────────────

	_bindComposer() {
		const $wrapper = $(this.wrapper);

		$wrapper.on("click", "#cw-btn-send", () => this._sendMessage());

		$wrapper.on("keydown", "#cw-composer-input", (e) => {
			if (e.key === "Enter" && !e.shiftKey) {
				e.preventDefault();
				this._sendMessage();
			}
		});

		$wrapper.on("click", "#cw-btn-resolve", () => {
			if (!this.activeConversation) return;
			frappe.call({
				method: "chatwoot_erp.api.resolve_conversation",
				args: { conversation_id: this.activeConversation },
				callback: () => this.loadConversations(this.currentSection),
			});
		});
	}

	_sendMessage() {
		const $input = $(this.wrapper).find("#cw-composer-input");
		const content = $input.val().trim();
		if (!content || !this.activeConversation) return;

		const $btn = $(this.wrapper).find("#cw-btn-send");
		$btn.prop("disabled", true);

		frappe.call({
			method: "chatwoot_erp.api.send_message",
			args: { conversation_id: this.activeConversation, content },
			callback: (r) => {
				$btn.prop("disabled", false);
				if (r.exc) return;
				$input.val("");
				this.openConversation(this.activeConversation);
			},
		});
	}

	// ── Search ───────────────────────────────────────────────────────────────

	_bindSearch() {
		let debounce;
		$(this.wrapper).on("input", "#cw-conv-search", (e) => {
			clearTimeout(debounce);
			const q = $(e.target).val().toLowerCase();
			debounce = setTimeout(() => {
				const filtered = this.conversations.filter((c) => {
					const name = ((c.meta && c.meta.sender && c.meta.sender.name) || "").toLowerCase();
					return name.includes(q);
				});
				this._renderConversations(filtered);
			}, 200);
		});
	}

	// ── Realtime & polling ───────────────────────────────────────────────────

	setupRealtime() {
		frappe.realtime.on("chatwoot_event", (payload) => {
			const event = payload && payload.event;
			if (event === "message_created" && payload.data) {
				const convId = payload.data.conversation && payload.data.conversation.id;
				if (convId && convId == this.activeConversation) {
					this.openConversation(convId);
				}
			}
			if (["conversation_created", "conversation_resolved", "conversation_status_changed"].includes(event)) {
				this.loadConversations(this.currentSection);
			}
		});
	}

	startPolling() {
		this.pollingInterval = setInterval(() => {
			this.loadConversations(this.currentSection);
		}, 10000);
	}
}

function _formatTime(ts) {
	if (!ts) return "";
	const d = typeof ts === "number" ? new Date(ts * 1000) : new Date(ts);
	const now = new Date();
	const diff = now - d;
	if (diff < 60000) return "ahora";
	if (diff < 3600000) return `${Math.floor(diff / 60000)}m`;
	if (diff < 86400000) return `${Math.floor(diff / 3600000)}h`;
	return d.toLocaleDateString();
}

frappe.pages["chatwoot-chat"].on_page_load = function (wrapper) {
	const app = new ChatwootApp(wrapper);
	frappe.chatwoot_app = app;
	app.init();
};

frappe.pages["chatwoot-chat"].on_page_show = function () {
	if (frappe.chatwoot_app) {
		frappe.chatwoot_app.loadConversations(frappe.chatwoot_app.currentSection);
	}
};
