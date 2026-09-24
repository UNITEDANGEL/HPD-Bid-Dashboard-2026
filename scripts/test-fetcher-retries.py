"""Verify Gmail calls opt into bounded retries and transient timeouts recover."""
import ast
from http.client import IncompleteRead
from unittest.mock import patch
from gmail_transport import GmailRequest
from pathlib import Path
from googleapiclient.http import HttpRequest
from httplib2 import Response

tree = ast.parse((Path(__file__).resolve().parents[1] / 'FetchrMatcherV5.py').read_text(encoding='utf-8-sig'))
calls = [node for node in ast.walk(tree) if isinstance(node, ast.Call) and isinstance(node.func, ast.Attribute) and node.func.attr == 'execute']
assert len(calls) == 6
assert all(any(k.arg == 'num_retries' and isinstance(k.value, ast.Constant) and k.value.value == 3 for k in call.keywords) for call in calls)

class Transport:
    def __init__(self, failures):
        self.failures = failures
        self.calls = 0

    def request(self, *args, **kwargs):
        self.calls += 1
        if self.calls <= self.failures:
            raise TimeoutError('synthetic timeout')
        return Response({'status': '200'}), b'{}'

def request(transport):
    result = HttpRequest(transport, lambda response, content: content, 'https://example.invalid/test')
    result._sleep = lambda _: None
    result._rand = lambda: 0
    return result

transient = Transport(1)
assert request(transient).execute(num_retries=3) == b'{}'
assert transient.calls == 2
failed = Transport(10)
try:
    request(failed).execute(num_retries=3)
    raise AssertionError('Exhausted retries must fail')
except TimeoutError:
    assert failed.calls == 4
print('PASS: six Gmail calls retry; transient timeout recovers; persistent timeout stops after four attempts')

req = GmailRequest(Transport(0), lambda response, content: content, 'https://example.invalid/test')
with patch.object(HttpRequest, 'execute', side_effect=[IncompleteRead(b'partial'), b'complete']), patch('gmail_transport.time.sleep'):
    assert req.execute(num_retries=3) == b'complete'
with patch.object(HttpRequest, 'execute', side_effect=IncompleteRead(b'partial')) as execute, patch('gmail_transport.time.sleep'):
    try:
        req.execute(num_retries=3)
        raise AssertionError('Partial downloads must not succeed')
    except IncompleteRead:
        assert execute.call_count == 4
print('PASS: truncated attachments retry; persistent truncation fails without returning partial data')
