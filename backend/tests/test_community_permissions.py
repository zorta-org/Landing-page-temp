from bson import ObjectId
from app.routes.community import can_moderate_target, role_for


def server(owner, admins, members):
    return {'owner_id': owner, 'admins': admins, 'members': members}


def test_owner_can_moderate_member_and_admin_but_not_self():
    owner, admin, member = ObjectId(), ObjectId(), ObjectId()
    s = server(owner, [admin], [owner, admin, member])
    assert can_moderate_target(s, owner, member) == (True, None)
    assert can_moderate_target(s, owner, admin) == (True, None)
    assert can_moderate_target(s, owner, owner) == (False, 'cannot_moderate_owner')


def test_admin_can_only_moderate_members():
    owner, admin, member = ObjectId(), ObjectId(), ObjectId()
    s = server(owner, [admin], [owner, admin, member])
    assert can_moderate_target(s, admin, member) == (True, None)
    assert can_moderate_target(s, admin, admin) == (False, 'admins_can_only_moderate_members')
    assert can_moderate_target(s, admin, owner) == (False, 'cannot_moderate_owner')


def test_member_and_nonmember_are_denied():
    owner, admin, member, outsider = [ObjectId() for _ in range(4)]
    s = server(owner, [admin], [owner, admin, member])
    assert can_moderate_target(s, member, owner) == (False, 'forbidden')
    assert can_moderate_target(s, member, admin) == (False, 'forbidden')
    assert can_moderate_target(s, member, outsider) == (False, 'forbidden')


def test_server_roles_are_exactly_owner_admin_member():
    owner, admin, member = ObjectId(), ObjectId(), ObjectId()
    s = server(owner, [admin], [owner, admin, member])
    assert {role_for(s, x) for x in [owner, admin, member]} == {'Owner', 'Admin', 'Member'}
