"""Stripe integration. The only package that imports `stripe` (CLAUDE.md conventions).

Everything else talks to a `PaymentGateway` (gateway.py); tests use `FakeGateway` (fake.py).
"""
