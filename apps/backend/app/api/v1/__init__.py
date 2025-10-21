"""Version 1 API blueprint and namespace registration."""

from __future__ import annotations

from flask import Blueprint
from flask_restx import Api

from .resources.devices import ns as ns_devices
from .resources.groups import ns as ns_groups
from .resources.jobs import ns as ns_jobs
from .resources.platforms import ns as ns_platforms
from .resources.credential_profiles import ns as ns_creds
from .resources.inventory_groups import ns as ns_inventory
from .resources.interfaces import ns as ns_interfaces
from .resources.ip_addresses import ns as ns_ipaddrs
from .resources.snapshots import ns as ns_snapshots
from .resources.platform_operation_templates import ns as ns_op_templates
from .resources.compliance import ns as ns_compliance
from .resources.operations import ns as ns_operations
from .resources.logs import ns as ns_logs
from .resources.audit import ns as ns_audit
from .resources.eox_hardware import ns as ns_eox_hw
from .resources.eox_software import ns as ns_eox_sw
from .resources.eox_queries import ns as ns_eox_queries

api_bp: Blueprint = Blueprint("api_v1", __name__, url_prefix="/api/v1")

api: Api = Api(
    api_bp,
    title="Orbit API",
    version="1.0",
    description="Central API for Orbit device management and lifecycle tracking",
    doc=False,
)


def register_namespaces() -> None:
    """Register all resource namespaces with the API."""

    api.add_namespace(ns_devices)
    api.add_namespace(ns_groups)
    api.add_namespace(ns_jobs)
    api.add_namespace(ns_platforms)
    api.add_namespace(ns_creds)
    api.add_namespace(ns_inventory)
    api.add_namespace(ns_interfaces)
    api.add_namespace(ns_ipaddrs)
    api.add_namespace(ns_snapshots)
    api.add_namespace(ns_op_templates)
    api.add_namespace(ns_compliance)
    api.add_namespace(ns_operations)
    api.add_namespace(ns_logs)
    api.add_namespace(ns_audit)
    api.add_namespace(ns_eox_hw)
    api.add_namespace(ns_eox_sw)
    api.add_namespace(ns_eox_queries)


register_namespaces()
