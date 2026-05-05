import hashlib
import hmac
import json

import frappe


def handle():
	"""Called via /api/method/chatwoot_erp.webhook.handle"""
	if frappe.request.method != "POST":
		frappe.throw("Method not allowed", frappe.PermissionError)

	raw_body = frappe.request.get_data()
	secret = frappe.db.get_single_value("Chatwoot Settings", "webhook_secret")

	if secret:
		sig = frappe.request.headers.get("X-Chatwoot-Signature", "")
		expected = hmac.new(secret.encode(), raw_body, hashlib.sha256).hexdigest()
		if not hmac.compare_digest(sig, expected):
			frappe.throw("Invalid webhook signature", frappe.PermissionError)

	try:
		data = json.loads(raw_body)
	except Exception:
		frappe.throw("Invalid JSON payload")

	event = data.get("event")
	if event in ("message_created", "conversation_created", "conversation_resolved", "conversation_status_changed"):
		frappe.publish_realtime("chatwoot_event", {"event": event, "data": data})

	frappe.response["http_status_code"] = 200
	frappe.response["message"] = "ok"
