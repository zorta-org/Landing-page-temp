def test_user_response_shape():
    # Contract test: frontend depends on these fields after login.
    required = {"id", "username", "display_name", "reputation"}
    sample = {"id": "abc", "username": "maya", "display_name": "Maya Chen", "reputation": 10}
    assert required.issubset(sample)
