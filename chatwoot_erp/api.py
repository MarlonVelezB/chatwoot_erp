import frappe
from chatwoot_erp.chatwoot_client import ChatwootClient


@frappe.whitelist()
def get_conversations(filter_type="all", page=1):
	client = ChatwootClient()
	return client.get_conversations(page=int(page), assignee_type=filter_type)


@frappe.whitelist()
def get_messages(conversation_id):
	client = ChatwootClient()
	return client.get_messages(conversation_id)


@frappe.whitelist()
def send_message(conversation_id, content):
	client = ChatwootClient()
	return client.send_message(conversation_id, content)


@frappe.whitelist()
def get_contacts(search="", page=1):
	client = ChatwootClient()
	return client.get_contacts(page=int(page), search=search)


@frappe.whitelist()
def resolve_conversation(conversation_id):
	client = ChatwootClient()
	return client.toggle_status(conversation_id, "resolved")
