from bson import ObjectId
from app.utils.serial import doc

def test_nested_objectid():
    x=doc({'_id':ObjectId(),'owner':ObjectId(),'members':[ObjectId()]})
    assert isinstance(x['id'],str) and isinstance(x['owner'],str) and isinstance(x['members'][0],str)
