import logging
import traceback

from flask import jsonify
from flask_restx import Namespace, Resource, reqparse
from flask_jwt_extended import jwt_required, get_jwt

from portal.models.roles     import Roles, RoleTypes
from portal.models.audit_logs import AuditLogs

from . import ns, logger


def _require_admin():
    claims = get_jwt()
    if claims.get('role') != 'ADMIN':
        return jsonify(bool=False, status=403, response={'message': 'Admin access required.'})
    return None


# ── Parsers  ─────────────

create_parser = reqparse.RequestParser()
create_parser.add_argument('role_name',   type=str, required=True,  location='json')
create_parser.add_argument('description', type=str, required=False, location='json')

update_parser = reqparse.RequestParser()
update_parser.add_argument('description', type=str, required=False, location='json')
update_parser.add_argument('is_active',   type=bool, required=False, location='json')


# ── Create Role  ─────────

@ns.route('/create_role')
class CreateRole(Resource):
    @ns.doc(description='[ADMIN] Create a new role.',
            responses={200: 'Created', 400: 'Already exists', 403: 'Forbidden', 500: 'Server error'})
    @jwt_required()
    @ns.expect(create_parser, validate=True)
    def post(self):
        try:
            err = _require_admin()
            if err:
                return err

            args      = create_parser.parse_args(strict=False)
            role_name = args['role_name'].strip().upper()
            desc      = args.get('description', '')

            if Roles.query.filter_by(role_name=role_name).first():
                return jsonify(bool=False, status=400, response={'message': f"Role '{role_name}' already exists."})

            role             = Roles()
            role.role_name   = role_name
            role.description = desc
            role.save()

            claims = get_jwt()
            log = AuditLogs()
            log.user_id       = claims.get('user_id')
            log.action        = 'CREATE_ROLE'
            log.action_category = 'ADMIN'
            log.entity_type   = 'ROLE'
            log.entity_id     = role.role_id
            log.description   = f"Role '{role_name}' created."
            log.status        = 'SUCCESS'
            log.save()

            logger.info(f"Role created: {role_name}")
            return jsonify(bool=True, status=200, response={
                'message': 'Role created successfully.',
                'role_id': role.role_id,
            })

        except Exception as e:
            traceback.print_exc()
            return jsonify(bool=False, status=500, response={'message': str(e)})


# ── List Roles  ──────────

@ns.route('/list_roles')
class ListRoles(Resource):
    @ns.doc(description='[ADMIN] Get all roles.')
    @jwt_required()
    def get(self):
        try:
            err = _require_admin()
            if err:
                return err

            roles = Roles.query.all()
            data  = [{
                'role_id':     r.role_id,
                'role_name':   r.role_name,
                'description': r.description,
                'is_active':   r.is_active,
                'created_on':  str(r.created_on),
            } for r in roles]

            return jsonify(bool=True, status=200, response={'roles': data, 'total': len(data)})

        except Exception as e:
            traceback.print_exc()
            return jsonify(bool=False, status=500, response={'message': str(e)})


# ── Get / Update / Delete Role ─────────────────────────────────────────────────

@ns.route('/<int:role_id>')
class RoleDetail(Resource):

    @ns.doc(description='[ADMIN] Get role by ID.')
    @jwt_required()
    def get(self, role_id):
        try:
            err = _require_admin()
            if err:
                return err

            role = Roles.query.get(role_id)
            if not role:
                return jsonify(bool=False, status=404, response={'message': 'Role not found.'})

            return jsonify(bool=True, status=200, response={
                'role_id':     role.role_id,
                'role_name':   role.role_name,
                'description': role.description,
                'is_active':   role.is_active,
                'created_on':  str(role.created_on),
                'updated_on':  str(role.updated_on),
            })

        except Exception as e:
            traceback.print_exc()
            return jsonify(bool=False, status=500, response={'message': str(e)})

    @ns.doc(description='[ADMIN] Update role description or active status.')
    @jwt_required()
    @ns.expect(update_parser, validate=False)
    def put(self, role_id):
        try:
            err = _require_admin()
            if err:
                return err

            role = Roles.query.get(role_id)
            if not role:
                return jsonify(bool=False, status=404, response={'message': 'Role not found.'})

            args = update_parser.parse_args(strict=False)
            if args.get('description') is not None:
                role.description = args['description']
            if args.get('is_active') is not None:
                role.is_active = args['is_active']
            role.update()

            return jsonify(bool=True, status=200, response={'message': 'Role updated successfully.'})

        except Exception as e:
            traceback.print_exc()
            return jsonify(bool=False, status=500, response={'message': str(e)})

    @ns.doc(description='[ADMIN] Delete a role (only if no users are assigned).')
    @jwt_required()
    def delete(self, role_id):
        try:
            err = _require_admin()
            if err:
                return err

            role = Roles.query.get(role_id)
            if not role:
                return jsonify(bool=False, status=404, response={'message': 'Role not found.'})

            if role.users.count() > 0:
                return jsonify(bool=False, status=400, response={
                    'message': f"Cannot delete: {role.users.count()} user(s) assigned to this role."
                })

            role.delete()
            return jsonify(bool=True, status=200, response={'message': 'Role deleted successfully.'})

        except Exception as e:
            traceback.print_exc()
            return jsonify(bool=False, status=500, response={'message': str(e)})
