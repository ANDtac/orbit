"""Documentation route registration for OpenAPI UIs."""

from __future__ import annotations

from flask import Flask, render_template_string, url_for

_SWAGGER_TEMPLATE = """
<!DOCTYPE html>
<html lang=\"en\">
  <head>
    <meta charset=\"utf-8\" />
    <title>Orbit API Reference</title>
    <link rel=\"stylesheet\" href=\"https://cdn.jsdelivr.net/npm/swagger-ui-dist@5/swagger-ui.css\" />
  </head>
  <body>
    <div id=\"swagger-ui\"></div>
    <script src=\"https://cdn.jsdelivr.net/npm/swagger-ui-dist@5/swagger-ui-bundle.js\"></script>
    <script>
      window.onload = () => {
        window.ui = SwaggerUIBundle({
          url: '{{ openapi_url }}',
          dom_id: '#swagger-ui',
          displayRequestDuration: true,
          docExpansion: 'none'
        });
      };
    </script>
  </body>
</html>
"""

_REDOC_TEMPLATE = """
<!DOCTYPE html>
<html lang=\"en\">
  <head>
    <meta charset=\"utf-8\" />
    <title>Orbit API Reference</title>
    <style>body{margin:0;padding:0;}redoc{height:100vh;}</style>
    <script src=\"https://cdn.jsdelivr.net/npm/redoc@next/bundles/redoc.standalone.js\"></script>
  </head>
  <body>
    <redoc spec-url=\"{{ openapi_url }}\"></redoc>
  </body>
</html>
"""


def register_docs_routes(app: Flask) -> None:
    """Attach docs UI routes to the app."""

    @app.get("/docs")
    def swagger_docs():
        return render_template_string(_SWAGGER_TEMPLATE, openapi_url=url_for("api_v1.specs"))

    @app.get("/redoc")
    def redoc_docs():
        return render_template_string(_REDOC_TEMPLATE, openapi_url=url_for("api_v1.specs"))
