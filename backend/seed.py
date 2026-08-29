from app import create_app
from app.extensions import mongo
from werkzeug.security import generate_password_hash
from datetime import datetime, timezone, timedelta
import secrets
import string


def generate_user_id(existing_ids=None):
    existing_ids = existing_ids or set()
    alphabet = string.ascii_uppercase + string.digits

    while True:
        user_id = "Z-" + "".join(
            secrets.choice(alphabet) for _ in range(16)
        )

        if user_id not in existing_ids:
            existing_ids.add(user_id)
            return user_id


app = create_app()

with app.app_context():
    db = mongo.db

    # ------------------------------------------------------------------
    # CLEAR SEED DATA
    # ------------------------------------------------------------------

    collections = [
        'users',
        'posts',
        'comments',
        'votes',
        'saves',
        'workspaces',
        'files',
        'commits',
        'issues',
        'gigs',
        'proposals',
        'orders',
        'reviews',
        'startups',
        'startup_applications',
        'notifications',
        'servers',
        'channels',
        'messages',
        'badges',
        'activity',
        'followers',
        'credits',
        'rewards',
        'redemptions',
        'reports'
    ]

    for collection_name in collections:
        db[collection_name].delete_many({})

    now = datetime.now(timezone.utc)

    # ------------------------------------------------------------------
    # USERS
    # ------------------------------------------------------------------

    users = [
        (
            'maya@zorta.dev',
            'maya',
            'Maya Chen',
            'Frontend engineer building tiny tools with big ideas.',
            ['TypeScript', 'React', 'UI'],
            184,
            'admin'
        ),
        (
            'arjun@zorta.dev',
            'arjun',
            'Arjun Mehta',
            'Backend systems, Python and open source.',
            ['Python', 'Flask', 'MongoDB'],
            241,
            'user'
        ),
        (
            'noor@zorta.dev',
            'noor',
            'Noor Khan',
            'Product designer obsessed with useful interfaces.',
            ['Figma', 'Product Design', 'Research'],
            127,
            'user'
        )
    ]

    mongo_user_ids = []
    zorta_user_ids = set()

    for email, username, name, bio, skills, reputation, platform_role in users:

        zorta_id = generate_user_id(zorta_user_ids)

        result = db.users.insert_one({
            'email': email,
            'username': username,
            'user_id': zorta_id,

            'display_name': name,
            'bio': bio,

            'skills': skills,
            'interests': [
                'building',
                'open source'
            ],

            'roles': [
                'Builder'
            ],

            'links': {},

            'reputation': reputation,
            'platform_role': platform_role,

            'password_hash': generate_password_hash(
                'demo12345'
            ),

            'age_confirmed': True,
            'email_verified': True,
            'onboarding_complete': True,

            'created_at': now
        })

        mongo_user_ids.append(result.inserted_id)

        print(
            f"Created user @{username} "
            f"({zorta_id})"
        )

    # ------------------------------------------------------------------
    # CREDITS
    # ------------------------------------------------------------------

    db.credits.insert_many([
        {
            'user_id': mongo_user_ids[1],
            'amount': 200,
            'reason': 'seed_grant',
            'order_id': None,
            'created_at': now
        },
        {
            'user_id': mongo_user_ids[2],
            'amount': 150,
            'reason': 'seed_grant',
            'order_id': None,
            'created_at': now
        }
    ])

    # ------------------------------------------------------------------
    # REWARDS
    # ------------------------------------------------------------------

    db.rewards.insert_many([
        {
            'title': '$10 Amazon Gift Card',
            'description': 'Redeemable US Amazon gift card.',
            'category': 'gift_card',
            'cost': 500,
            'stock': 25,
            'active': True,
            'created_at': now
        },
        {
            'title': 'Discord Nitro (1 month)',
            'description': 'One month of Discord Nitro.',
            'category': 'gaming',
            'cost': 300,
            'stock': 40,
            'active': True,
            'created_at': now
        },
        {
            'title': 'Robux 800',
            'description': '800 Robux for Roblox.',
            'category': 'gaming',
            'cost': 650,
            'stock': 15,
            'active': True,
            'created_at': now
        }
    ])

    # ------------------------------------------------------------------
    # POSTS
    # ------------------------------------------------------------------

    posts = [
        (
            'maya',
            'Shipped a tiny habit tracker',
            (
                'Built the first version over a weekend. '
                'The interesting part was keeping the entire '
                'flow keyboard-first.'
            ),
            ['showcase', 'react', 'product'],
            42
        ),
        (
            'arjun',
            'What makes a developer tool actually feel fast?',
            (
                'I keep coming back to perceived latency, '
                'clear feedback and fewer context switches.'
            ),
            ['discussion', 'devtools'],
            31
        ),
        (
            'noor',
            'How do you decide what belongs on a profile?',
            (
                'I want profiles to show proof of work without '
                'turning into a resume dump.'
            ),
            ['design', 'profiles'],
            18
        )
    ]

    username_to_index = {
        'maya': 0,
        'arjun': 1,
        'noor': 2
    }

    for i, (username, title, body, tags, score) in enumerate(posts):

        user_index = username_to_index[username]

        db.posts.insert_one({
            'author_id': mongo_user_ids[user_index],
            'author_username': username,
            'author_name': users[user_index][2],

            'type': (
                'showcase'
                if i == 0
                else 'discussion'
            ),

            'title': title,
            'body': body,
            'tags': tags,

            'score': score,
            'comments_count': 0,

            'created_at': (
                now - timedelta(hours=i * 4 + 1)
            ),

            'updated_at': now
        })

    # ------------------------------------------------------------------
    # PROJECT / WORKSPACE
    # ------------------------------------------------------------------

    workspace = {
        'owner_id': mongo_user_ids[0],
        'owner_username': 'maya',

        'name': 'pocket-habits',

        'description': (
            'A focused habit tracker for people who hate '
            'bloated productivity apps.'
        ),

        'visibility': 'public',

        # IMPORTANT:
        # This is the actual programming language.
        # Do NOT change this to "none".
        'language': 'TypeScript',

        # Keep a separate field available if your text index
        # uses language_override.
        'search_language': 'english',

        'tags': [
            'react',
            'productivity'
        ],

        'stars': 86,

        'created_at': now
    }
    try:
        db.workspaces.drop_indexes()
    except Exception:
        pass

    ws = db.workspaces.insert_one(
        workspace
    ).inserted_id

    # ------------------------------------------------------------------
    # PROJECT FILES
    # ------------------------------------------------------------------

    db.files.insert_many([
        {
            'workspace_id': ws,
            'path': 'README.md',

            'content': (
                '# Pocket Habits\n\n'
                'A small, keyboard-first habit tracker.'
            ),

            'created_at': now,
            'updated_at': now
        },

        {
            'workspace_id': ws,
            'path': 'src/App.tsx',

            'content': (
                'export default function App(){ '
                'return <main>Pocket Habits</main> '
                '}'
            ),

            'created_at': now,
            'updated_at': now
        }
    ])

    # ------------------------------------------------------------------
    # PROJECT VERSIONS / COMMITS
    # ------------------------------------------------------------------

    db.commits.insert_many([
        {
            'workspace_id': ws,

            'message': 'Ship first public build',

            'author_id': mongo_user_ids[0],
            'author_username': 'maya',

            'created_at': (
                now - timedelta(days=1)
            )
        },

        {
            'workspace_id': ws,

            'message': 'Add keyboard navigation',

            'author_id': mongo_user_ids[0],
            'author_username': 'maya',

            'created_at': (
                now - timedelta(days=2)
            )
        }
    ])

    # ------------------------------------------------------------------
    # GIGS
    # ------------------------------------------------------------------

    gigs = [
        (
            'arjun',
            1,
            'Build a clean Flask API',
            180
        ),
        (
            'noor',
            2,
            'Landing page visual system',
            120
        )
    ]

    for username, user_index, title, budget in gigs:

        db.gigs.insert_one({
            'listing_type': 'job_request',
            'client_id': mongo_user_ids[user_index],
            'client_username': username,

            'title': title,

            'description': (
                'Need a small, thoughtful implementation '
                'with readable code and a clean handoff.'
            ),

            'skills': [
                'Python',
                'UI'
            ],

            'budget': budget,
            'deadline': '2026-09-15',

            'requirements': (
                'Clear communication and clean work.'
            ),

            'status': 'open',
            'created_at': now
        })

    db.gigs.insert_many([
        {
            'listing_type': 'service',
            'freelancer_id': mongo_user_ids[0],
            'freelancer_username': 'maya',
            'title': 'I will design a polished product landing page',
            'description': 'A focused landing page with clear hierarchy, responsive layouts and a clean developer handoff.',
            'skills': ['Design', 'Figma', 'UI'],
            'budget': 160, 'price': 160, 'deadline': '2026-09-20',
            'requirements': 'Provide your brand assets and the sections you need.',
            'category': 'Design', 'status': 'open', 'created_at': now
        },
        {
            'listing_type': 'service',
            'freelancer_id': mongo_user_ids[1],
            'freelancer_username': 'arjun',
            'title': 'I will build a small Flask API',
            'description': 'A clean Flask API with validation, readable route structure and a practical handoff.',
            'skills': ['Python', 'Flask', 'API'],
            'budget': 220, 'price': 220, 'deadline': '2026-09-25',
            'requirements': 'Share the endpoints and expected request/response shapes.',
            'category': 'Development', 'status': 'open', 'created_at': now
        }
    ])

    # ------------------------------------------------------------------
    # STARTUP
    # ------------------------------------------------------------------

    db.startups.insert_one({
        'owner_id': mongo_user_ids[0],
        'owner_username': 'maya',

        'name': 'Threadline',

        'logo': '',

        'tagline': (
            'A calmer way to collect ideas.'
        ),

        'description': (
            'A lightweight collaborative idea space.'
        ),

        'problem': (
            'Ideas disappear across disconnected tools.'
        ),

        'solution': (
            'A focused shared space built around context.'
        ),

        'stage': 'prototype',

        'tech_stack': [
            'React',
            'Python'
        ],

        'roles_needed': [
            'Backend Engineer',
            'Growth'
        ],

        'team': [
            {
                'user_id': mongo_user_ids[0],
                'username': 'maya',
                'role': 'Founder'
            }
        ],

        'created_at': now
    })

    # ------------------------------------------------------------------
    # BADGES
    # ------------------------------------------------------------------

    db.badges.insert_many([
        {
            'name': 'First Workspace',
            'description': 'Created a first workspace',
            'icon': 'W'
        },
        {
            'name': 'Early Builder',
            'description': 'Joined Zorta early',
            'icon': 'E'
        },
        {
            'name': 'Open Source Contributor',
            'description': (
                'Contributed to a public workspace'
            ),
            'icon': 'O'
        },
        {
            'name': '100 Reputation',
            'description': 'Reached 100 reputation',
            'icon': '100'
        }
    ])

    # ------------------------------------------------------------------
    # SERVER
    # ------------------------------------------------------------------

    server = db.servers.insert_one({
        'owner_id': mongo_user_ids[0],

        'name': 'Builder Corner',

        'description': (
            'Small group for shipping projects.'
        ),

        'members': mongo_user_ids,

        'admins': [],
        'banned': [],
        'muted': [],

        'created_at': now
    }).inserted_id

    # ------------------------------------------------------------------
    # CHANNELS
    # ------------------------------------------------------------------

    db.channels.insert_many([
        {
            'server_id': server,
            'name': name,
            'kind': 'text',
            'is_default': True,
            'created_at': now
        }

        for name in [
            'general',
            'media',
            'memes'
        ]
    ])

    # ------------------------------------------------------------------
    # MESSAGES
    # ------------------------------------------------------------------

    general_channel = db.channels.find_one({
        'server_id': server,
        'name': 'general'
    })

    if general_channel:
        channel_id = general_channel['_id']

        db.messages.insert_many([
            {
                'channel_id': channel_id,

                'author_id': mongo_user_ids[0],
                'author_username': 'maya',
                'author_name': 'Maya Chen',

                'body': 'welcome to the corner 👋',

                'created_at': (
                    now - timedelta(minutes=10)
                )
            },

            {
                'channel_id': channel_id,

                'author_id': mongo_user_ids[1],
                'author_username': 'arjun',
                'author_name': 'Arjun Mehta',

                'body': (
                    'shipping something this weekend.'
                ),

                'created_at': (
                    now - timedelta(minutes=4)
                )
            }
        ])

    # ------------------------------------------------------------------
    # FINISHED
    # ------------------------------------------------------------------

    print()
    print('Zorta seeded successfully.')
    print()
    print('Demo accounts:')
    print('  maya@zorta.dev  / demo12345')
    print('  arjun@zorta.dev / demo12345')
    print('  noor@zorta.dev  / demo12345')
    print()

    seeded_users = db.users.find(
        {
            'username': {
                '$in': [
                    'maya',
                    'arjun',
                    'noor'
                ]
            }
        },
        {
            '_id': 0,
            'username': 1,
            'user_id': 1
        }
    )

    print('Zorta IDs:')

    for user in seeded_users:
        print(
            f"  @{user['username']} -> "
            f"{user['user_id']}"
        )

    print()