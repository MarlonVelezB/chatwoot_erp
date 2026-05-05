import frappe
import requests


class ChatwootClient:
	def __init__(self):
		settings = frappe.get_single("Chatwoot Settings")
		if not settings.chatwoot_url or not settings.api_access_token or not settings.account_id:
			frappe.throw("Configura Chatwoot Settings antes de continuar.")
		self.base_url = f"{settings.chatwoot_url.rstrip('/')}/api/v1/accounts/{settings.account_id}"
		self.headers = {
			"api_access_token": settings.get_password("api_access_token"),
			"Content-Type": "application/json",
		}

	def _get(self, path, params=None):
		r = requests.get(f"{self.base_url}{path}", headers=self.headers, params=params, timeout=15)
		if not r.ok:
			frappe.throw(f"Chatwoot API error {r.status_code}: {r.text}")
		return r.json()

	def _post(self, path, payload=None):
		r = requests.post(f"{self.base_url}{path}", headers=self.headers, json=payload, timeout=15)
		if not r.ok:
			frappe.throw(f"Chatwoot API error {r.status_code}: {r.text}")
		return r.json()

	def get_conversations(self, page=1, assignee_type="all"):
		return self._get("/conversations", {"page": page, "assignee_type": assignee_type})

	def get_conversation(self, conversation_id):
		return self._get(f"/conversations/{conversation_id}")

	def get_messages(self, conversation_id):
		return self._get(f"/conversations/{conversation_id}/messages")

	def send_message(self, conversation_id, content, message_type="outgoing"):
		return self._post(
			f"/conversations/{conversation_id}/messages",
			{"content": content, "message_type": message_type, "private": False},
		)

	def get_contacts(self, page=1, search=""):
		params = {"page": page}
		if search:
			params["q"] = search
		return self._get("/contacts/search" if search else "/contacts", params)

	def toggle_status(self, conversation_id, status):
		return self._post(f"/conversations/{conversation_id}/toggle_status", {"status": status})
