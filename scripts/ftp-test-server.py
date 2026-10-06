#!/usr/bin/env python3
"""Disposable loopback FTP/implicit-FTPS server for test-ftp.cjs."""
import json, sys
from pyftpdlib.authorizers import DummyAuthorizer
from pyftpdlib.handlers import FTPHandler, TLS_FTPHandler
from pyftpdlib.servers import FTPServer
root, cert, key, mode = sys.argv[1:]
auth = DummyAuthorizer()
auth.add_user('fixture', 'test-only-password', root, perm='elradfmwMT')
class ImplicitTLSHandler(TLS_FTPHandler):
    def handle(self):
        self.secure_connection(self.ssl_context)
    def handle_ssl_established(self):
        FTPHandler.handle(self)
handler = ImplicitTLSHandler if mode == 'ftps' else FTPHandler
handler.authorizer = auth
if mode == 'ftps':
    handler.certfile = cert
    handler.keyfile = key
    handler.tls_control_required = True
    handler.tls_data_required = True
server = FTPServer(('127.0.0.1', 0), handler)
print(json.dumps({'port': server.socket.getsockname()[1]}), flush=True)
server.serve_forever()
