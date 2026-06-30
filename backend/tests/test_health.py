import sys
import unittest

from fastapi.testclient import TestClient

import main


class HealthEndpointTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.client = TestClient(main.app)

    def test_get_returns_no_content(self):
        response = self.client.get("/api/health")

        self.assertEqual(response.status_code, 204)
        self.assertEqual(response.content, b"")
        self.assertEqual(response.headers["cache-control"], "no-store")

    def test_head_returns_no_content(self):
        response = self.client.head("/api/health")

        self.assertEqual(response.status_code, 204)
        self.assertEqual(response.content, b"")

    def test_startup_does_not_import_heavy_processing_stacks(self):
        heavy_modules = ("fitz", "pandas", "pdfplumber", "langchain", "qdrant_client")

        self.assertFalse([name for name in heavy_modules if name in sys.modules])


if __name__ == "__main__":
    unittest.main()
