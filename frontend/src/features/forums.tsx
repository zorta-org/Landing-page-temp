
import React, { useEffect, useRef, useState } from 'react';
import {
  Compass,
  ArrowUp,
  ArrowDown,
  Bookmark,
  Share2,
  MessageSquare,
  Send,
  MoreHorizontal,
} from 'lucide-react';

import { api } from '../lib/api';
import { Avatar } from '../components/ui';
import type { User } from '../lib/types';
import '../styles.css';


/* =========================================================
   HELPERS
========================================================= */

function optimisticVote(
  currentVote: number,
  currentScore: number,
  nextVote: number
) {
  if (currentVote === nextVote) {
    return {
      vote: 0,
      score: currentScore - nextVote,
    };
  }

  return {
    vote: nextVote,
    score: currentScore + (nextVote - currentVote),
  };
}


async function sharePost(id: string) {
  const url = `${window.location.origin}/post/${id}`;

  if (navigator.share) {
    await navigator.share({
      title: 'Zorta Forum',
      url,
    });

    return 'Shared';
  }

  if (navigator.clipboard) {
    await navigator.clipboard.writeText(url);
    return 'Copied';
  }

  return 'Copy unavailable';
}


/* =========================================================
   FEED
========================================================= */

function Feed({
  limit = 25,
  viewer,
}: {
  limit?: number;
  viewer?: User;
}) {
  const [posts, setPosts] = useState<any[]>([]);
  const [sort, setSort] = useState('new');

  const [loading, setLoading] = useState(true);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);

  const load = async () => {
    setLoading(true);

    try {
      const x = await api(
        `/feed?sort=${sort}&limit=${limit}`
      );

      setPosts(x.posts || []);
      setNextCursor(x.next_cursor || null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, [sort, limit]);

  const loadMore = async () => {
    if (!nextCursor || loadingMore) return;

    setLoadingMore(true);

    try {
      const x = await api(
        `/feed?sort=${sort}&limit=${limit}&cursor=${encodeURIComponent(
          nextCursor
        )}`
      );

      setPosts((current) => [
        ...current,
        ...(x.posts || []),
      ]);

      setNextCursor(x.next_cursor || null);
    } finally {
      setLoadingMore(false);
    }
  };

  return (
    <div className="feed">
      <div className="feed-toolbar">
        <span>
          {sort === 'new' ? 'Latest' : 'Top'} posts
        </span>

        <div className="sort-switch">
          <button
            className={sort === 'new' ? 'sel' : ''}
            onClick={() => setSort('new')}
          >
            Latest
          </button>

          <button
            className={sort === 'top' ? 'sel' : ''}
            onClick={() => setSort('top')}
          >
            Top
          </button>
        </div>
      </div>

      {loading ? (
        <div className="skeletons">
          {[1, 2, 3].map((i) => (
            <div
              className="skeleton"
              key={i}
            />
          ))}
        </div>
      ) : posts.length ? (
        <>
          {posts.map((post) => (
            <Post
              key={post.id}
              post={post}
              viewer={viewer}
              onChanged={load}
            />
          ))}

          {nextCursor && (
            <button
              className="load-more"
              onClick={loadMore}
              disabled={loadingMore}
            >
              {loadingMore
                ? 'Loading…'
                : 'Load more posts'}
            </button>
          )}
        </>
      ) : (
        <div className="empty">
          <Compass size={20} />
          No posts yet.
        </div>
      )}
    </div>
  );
}


/* =========================================================
   POST
========================================================= */

function Post({
  post,
  viewer,
  onChanged,
}: {
  post: any;
  viewer?: User;
  onChanged: () => void;
}) {
  const [vote, setVote] = useState(
    post.my_vote || 0
  );

  const [score, setScore] = useState(
    post.score || 0
  );

  const [saved, setSaved] = useState(
    Boolean(post.saved)
  );

  const [comments, setComments] = useState<any[]>(
    []
  );

  const [showComments, setShowComments] =
    useState(false);

  const [commentsLoading, setCommentsLoading] =
    useState(false);

  const [commentsCursor, setCommentsCursor] =
    useState<string | null>(null);

  const [commentsLoadingMore, setCommentsLoadingMore] =
    useState(false);

  const [text, setText] = useState('');
  const [replyTo, setReplyTo] =
    useState<string | null>(null);

  const [error, setError] = useState('');
  const [shareState, setShareState] =
    useState('');

  const [editing, setEditing] =
    useState(false);

  const [editBody, setEditBody] =
    useState(post.body || '');

  const [deleted, setDeleted] =
    useState(false);

  const voteRequestRef = useRef(0);
  const saveRequestRef = useRef(0);

  /* -------------------------------------------------------
     POST VOTE — FULLY OPTIMISTIC
  ------------------------------------------------------- */

  const voteIt = (nextVote: number) => {
    const previousVote = vote;
    const previousScore = score;

    const optimistic = optimisticVote(
      previousVote,
      previousScore,
      nextVote
    );

    setVote(optimistic.vote);
    setScore(optimistic.score);

    const requestId =
      ++voteRequestRef.current;

    api(
      `/posts/${post.id}/vote`,
      {
        method: 'POST',
        body: JSON.stringify({
          value: nextVote,
        }),
      }
    )
      .then((result) => {
        if (
          requestId ===
          voteRequestRef.current
        ) {
          setVote(result.my_vote);
          setScore(result.score);
        }
      })
      .catch((e: any) => {
        if (
          requestId ===
          voteRequestRef.current
        ) {
          setVote(previousVote);
          setScore(previousScore);
          setError(
            e?.message ||
              'Unable to update vote.'
          );
        }
      });
  };


  /* -------------------------------------------------------
     SAVE — FULLY OPTIMISTIC
  ------------------------------------------------------- */

  const save = () => {
    const previousSaved = saved;

    setSaved(!previousSaved);

    const requestId =
      ++saveRequestRef.current;

    api(
      `/posts/${post.id}/save`,
      {
        method: 'POST',
      }
    )
      .then((result) => {
        if (
          requestId ===
          saveRequestRef.current
        ) {
          setSaved(Boolean(result.saved));
        }
      })
      .catch((e: any) => {
        if (
          requestId ===
          saveRequestRef.current
        ) {
          setSaved(previousSaved);
          setError(
            e?.message ||
              'Unable to save post.'
          );
        }
      });
  };


  /* -------------------------------------------------------
     COMMENTS
  ------------------------------------------------------- */

  const loadComments = async () => {
    if (showComments) {
      setShowComments(false);
      return;
    }

    setShowComments(true);
    setCommentsLoading(true);

    try {
      const x = await api(
        `/posts/${post.id}/comments?limit=30`
      );

      setComments(x.comments || []);
      setCommentsCursor(
        x.next_cursor || null
      );
    } catch (e: any) {
      setError(
        e?.message ||
          'Unable to load replies.'
      );
    } finally {
      setCommentsLoading(false);
    }
  };


  const loadMoreComments = async () => {
    if (
      !commentsCursor ||
      commentsLoadingMore
    ) {
      return;
    }

    setCommentsLoadingMore(true);

    try {
      const x = await api(
        `/posts/${post.id}/comments?limit=30&cursor=${encodeURIComponent(
          commentsCursor
        )}`
      );

      setComments((current) => [
        ...current,
        ...(x.comments || []),
      ]);

      setCommentsCursor(
        x.next_cursor || null
      );
    } catch (e: any) {
      setError(
        e?.message ||
          'Unable to load more replies.'
      );
    } finally {
      setCommentsLoadingMore(false);
    }
  };


  /* -------------------------------------------------------
     ADD COMMENT — NO REFRESH
  ------------------------------------------------------- */

  const addComment = async () => {
    const body = text.trim();

    if (!body) return;

    const previousText = text;
    const previousReplyTo = replyTo;

    /*
     * Temporary local comment.
     * This is rendered immediately.
     */
    const optimisticId =
      `local-${Date.now()}-${Math.random()
        .toString(36)
        .slice(2)}`;

    const optimisticComment = {
      id: optimisticId,
      body,
      parent_id: replyTo,
      author_name:
        viewer?.display_name ||
        viewer?.username ||
        'You',
      author_username:
        viewer?.username || '',
      created_at:
        new Date().toISOString(),
      score: 0,
      my_vote: 0,
      optimistic: true,
    };

    setComments((current) => [
      ...current,
      optimisticComment,
    ]);

    setText('');
    setReplyTo(null);
    setError('');

    try {
      const result = await api(
        `/posts/${post.id}/comments`,
        {
          method: 'POST',
          body: JSON.stringify({
            body,
            parent_id:
              previousReplyTo,
          }),
        }
      );

      setComments((current) =>
        current.map((comment) =>
          comment.id === optimisticId
            ? result.comment
            : comment
        )
      );
    } catch (e: any) {
      /*
       * Remove failed optimistic reply
       * and restore the input.
       */
      setComments((current) =>
        current.filter(
          (comment) =>
            comment.id !== optimisticId
        )
      );

      setText(previousText);
      setReplyTo(previousReplyTo);

      setError(
        e?.message ||
          'Unable to post reply.'
      );
    }
  };


  /* -------------------------------------------------------
     SHARE
  ------------------------------------------------------- */

  const share = async () => {
    try {
      const result =
        await sharePost(post.id);

      setShareState(result);

      window.setTimeout(
        () => setShareState(''),
        1400
      );
    } catch (e: any) {
      /*
       * navigator.share throws AbortError
       * when the user closes the share sheet.
       * Don't show an error for that.
       */
      if (
        e?.name !==
        'AbortError'
      ) {
        setError(
          e?.message ||
            'Unable to share post.'
        );
      }
    }
  };


  /* -------------------------------------------------------
     POST ACTIONS
  ------------------------------------------------------- */

  const removePost = async () => {
    if (
      !confirm(
        'Delete this post?'
      )
    ) {
      return;
    }

    try {
      setDeleted(true);

      await api(
        `/posts/${post.id}`,
        {
          method: 'DELETE',
        }
      );

      onChanged();
    } catch (e: any) {
      setDeleted(false);

      setError(
        e?.message ||
          'Unable to delete post.'
      );
    }
  };


  const saveEdit = async () => {
    const previousBody =
      post.body;

    const nextBody =
      editBody.trim();

    if (!nextBody) return;

    post.body = nextBody;
    setEditing(false);

    try {
      const result =
        await api(
          `/posts/${post.id}`,
          {
            method: 'PATCH',
            body: JSON.stringify({
              body: nextBody,
            }),
          }
        );

      post.body =
        result.post.body;
    } catch (e: any) {
      post.body =
        previousBody;

      setEditBody(
        previousBody
      );

      setEditing(true);

      setError(
        e?.message ||
          'Unable to edit post.'
      );
    }
  };


  const report = async () => {
    try {
      await api(
        `/posts/${post.id}/report`,
        {
          method: 'POST',
          body: JSON.stringify({
            reason: 'other',
          }),
        }
      );

      setError(
        'Report submitted.'
      );
    } catch (e: any) {
      setError(
        e?.message ||
          'Unable to report post.'
      );
    }
  };


  if (deleted) {
    return null;
  }


  /* -------------------------------------------------------
     RENDER
  ------------------------------------------------------- */

  return (
    <article
      className="post"
      style={{
        contentVisibility:
          'auto',
        containIntrinsicSize:
          '400px',
      }}
    >
      <div className="post-meta">
        <a href={`/profile/${post.author_username}`} className="avatar-link">
          <Avatar user={{display_name:post.author_name,username:post.author_username}} />
        </a>

        <div>
          <a
            href={
              `/profile/${post.author_username}`
            }
          >
            {post.author_name}
          </a>

          <small>
            @{post.author_username}
            {' · '}
            {new Date(
              post.created_at
            ).toLocaleDateString()}
          </small>
        </div>

        <div className="post-menu">
          <button
            className="more"
            title="Post actions"
          >
            <MoreHorizontal
              size={18}
            />
          </button>

          {viewer?.username ===
            post.author_username && (
            <>
              <button
                onClick={() =>
                  setEditing(true)
                }
              >
                Edit
              </button>

              <button
                onClick={removePost}
              >
                Delete
              </button>
            </>
          )}

          <button
            onClick={report}
          >
            Report
          </button>
        </div>
      </div>


      {post.title && (
        <h3>{post.title}</h3>
      )}


      {editing ? (
        <div className="edit-post">
          <textarea
            value={editBody}
            onChange={(e) =>
              setEditBody(
                e.target.value
              )
            }
          />

          <div>
            <button
              className="primary"
              onClick={saveEdit}
            >
              Save
            </button>

            <button
              onClick={() =>
                setEditing(false)
              }
            >
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <p>{post.body}</p>
      )}


      {Array.isArray(post.images) &&
        post.images.length > 0 && (
          <div className="forum-image-grid">
            {post.images.map(
              (
                image: string,
                index: number
              ) => (
                <a
                  key={`${image}-${index}`}
                  href={image}
                  target="_blank"
                  rel="noreferrer"
                  className="forum-image"
                >
                  <img
                    src={image}
                    alt=""
                    loading="lazy"
                    decoding="async"
                  />
                </a>
              )
            )}
          </div>
        )}


      <div className="tags">
        {(post.tags || []).map(
          (tag: string) => (
            <span key={tag}>
              #{tag}
            </span>
          )
        )}
      </div>


      <div className="post-actions">
        <div className="vote">
          <button
            className={
              `vote-action up ${
                vote === 1
                  ? 'voted'
                  : ''
              }`
            }
            onClick={() =>
              voteIt(1)
            }
            aria-label="Upvote"
          >
            <ArrowUp size={16} />
          </button>

          <b>{score}</b>

          <button
            className={
              `vote-action down ${
                vote === -1
                  ? 'downvoted'
                  : ''
              }`
            }
            onClick={() =>
              voteIt(-1)
            }
            aria-label="Downvote"
          >
            <ArrowDown size={16} />
          </button>
        </div>


        <button
          onClick={loadComments}
        >
          <MessageSquare
            size={16}
          />

          {post.comments_count ||
            comments.length}
        </button>


        <button
          className={
            saved
              ? 'saved'
              : ''
          }
          onClick={save}
        >
          <Bookmark
            size={16}
          />

          {saved
            ? 'Saved'
            : 'Save'}
        </button>


        <button
          onClick={share}
        >
          <Share2 size={16} />

          {shareState ||
            'Share'}
        </button>
      </div>


      {showComments && (
        <div className="comments">
          {commentsLoading ? (
            <div className="comments-loading">
              Loading replies…
            </div>
          ) : (
            <>
              {comments.map(
                (comment) => {
                  let depth = 0;
                  let parent =
                    comment.parent_id;

                  const seen =
                    new Set<string>();

                  while (
                    parent &&
                    depth < 4 &&
                    !seen.has(parent)
                  ) {
                    seen.add(parent);

                    const parentComment =
                      comments.find(
                        (item) =>
                          item.id ===
                          parent
                      );

                    if (
                      !parentComment
                    ) {
                      break;
                    }

                    depth++;

                    parent =
                      parentComment.parent_id;
                  }

                  return (
                    <Comment
                      key={comment.id}
                      c={comment}
                      viewer={viewer}
                      depth={depth}
                      onReply={() =>
                        setReplyTo(
                          comment.id
                        )
                      }
                    />
                  );
                }
              )}

              {commentsCursor && (
                <button
                  className="load-more-replies"
                  onClick={
                    loadMoreComments
                  }
                  disabled={
                    commentsLoadingMore
                  }
                >
                  {commentsLoadingMore
                    ? 'Loading…'
                    : 'Load more replies'}
                </button>
              )}
            </>
          )}


          <div className="comment-box">
            {replyTo && (
              <div className="replying-to">
                Replying to a comment
                <button
                  onClick={() =>
                    setReplyTo(null)
                  }
                >
                  Cancel
                </button>
              </div>
            )}

            <input
              value={text}
              onChange={(e) =>
                setText(
                  e.target.value
                )
              }
              onKeyDown={(e) => {
                if (
                  e.key ===
                    'Enter' &&
                  !e.shiftKey
                ) {
                  e.preventDefault();
                  addComment();
                }
              }}
              placeholder={
                replyTo
                  ? 'Replying to a comment…'
                  : 'Add a thoughtful reply…'
              }
            />

            <button
              onClick={addComment}
              disabled={
                !text.trim()
              }
              aria-label="Send reply"
            >
              <Send size={16} />
            </button>
          </div>
        </div>
      )}


      {error && (
        <div className="inline-error">
          {error}
        </div>
      )}
    </article>
  );
}


/* =========================================================
   COMMENT
========================================================= */

function Comment({
  c,
  viewer,
  depth = 0,
  onReply,
}: {
  c: any;
  viewer?: User;
  depth?: number;
  onReply: () => void;
}) {
  const [score, setScore] =
    useState(c.score || 0);

  const [myVote, setMyVote] =
    useState(c.my_vote || 0);

  const [editing, setEditing] =
    useState(false);

  const [deleted, setDeleted] =
    useState(false);

  const [body, setBody] =
    useState(c.body || '');

  const voteRequestRef =
    useRef(0);


  /* -------------------------------------------------------
     COMMENT VOTE — INSTANT
  ------------------------------------------------------- */

  const vote = (
    nextVote: number
  ) => {
    const previousVote =
      myVote;

    const previousScore =
      score;

    const optimistic =
      optimisticVote(
        previousVote,
        previousScore,
        nextVote
      );

    setMyVote(
      optimistic.vote
    );

    setScore(
      optimistic.score
    );

    const requestId =
      ++voteRequestRef.current;

    api(
      `/comments/${c.id}/vote`,
      {
        method: 'POST',
        body: JSON.stringify({
          value: nextVote,
        }),
      }
    )
      .then((result) => {
        if (
          requestId ===
          voteRequestRef.current
        ) {
          setMyVote(
            result.my_vote ??
              optimistic.vote
          );

          setScore(
            result.score
          );
        }
      })
      .catch(() => {
        if (
          requestId ===
          voteRequestRef.current
        ) {
          setMyVote(
            previousVote
          );

          setScore(
            previousScore
          );
        }
      });
  };


  /* -------------------------------------------------------
     EDIT
  ------------------------------------------------------- */

  const saveComment =
    async () => {
      const previousBody =
        c.body;

      const nextBody =
        body.trim();

      if (!nextBody) {
        return;
      }

      c.body = nextBody;
      setEditing(false);

      try {
        const result =
          await api(
            `/comments/${c.id}`,
            {
              method: 'PATCH',
              body: JSON.stringify({
                body: nextBody,
              }),
            }
          );

        c.body =
          result.comment.body;

        setBody(
          result.comment.body
        );
      } catch {
        c.body =
          previousBody;

        setBody(
          previousBody
        );

        setEditing(true);
      }
    };


  /* -------------------------------------------------------
     DELETE
  ------------------------------------------------------- */

  const deleteComment =
    async () => {
      if (
        !confirm(
          'Delete this reply?'
        )
      ) {
        return;
      }

      setDeleted(true);

      try {
        await api(
          `/comments/${c.id}`,
          {
            method: 'DELETE',
          }
        );
      } catch {
        setDeleted(false);
      }
    };


  if (deleted) {
    return null;
  }


  return (
    <div
      className={
        `comment ${
          c.optimistic
            ? 'comment-pending'
            : ''
        }`
      }
      style={{
        marginLeft:
          Math.min(
            depth,
            4
          ) * 22,
      }}
    >
      <Avatar
        user={{
          display_name:
            c.author_name,
        }}
        size="sm"
      />

      <div>
        <b>
          {c.author_name}
        </b>

        <small className="comment-time">
          {c.created_at
            ? new Date(
                c.created_at
              ).toLocaleString()
            : 'Just now'}
        </small>


        {editing ? (
          <div className="edit-comment">
            <input
              value={body}
              onChange={(e) =>
                setBody(
                  e.target.value
                )
              }
            />

            <button
              onClick={
                saveComment
              }
            >
              Save
            </button>

            <button
              onClick={() =>
                setEditing(false)
              }
            >
              Cancel
            </button>
          </div>
        ) : (
          <p>{c.body}</p>
        )}


        <div className="comment-tools">
          <button
            onClick={onReply}
          >
            Reply
          </button>

          {viewer?.username ===
            c.author_username && (
            <>
              <button
                onClick={() =>
                  setEditing(true)
                }
              >
                Edit
              </button>

              <button
                onClick={
                  deleteComment
                }
              >
                Delete
              </button>
            </>
          )}
        </div>


        <div className="comment-vote">
          <button
            className={
              myVote === 1
                ? 'voted'
                : ''
            }
            onClick={() =>
              vote(1)
            }
            aria-label="Upvote reply"
          >
            ↑
          </button>

          <b>{score}</b>

          <button
            className={
              myVote === -1
                ? 'downvoted'
                : ''
            }
            onClick={() =>
              vote(-1)
            }
            aria-label="Downvote reply"
          >
            ↓
          </button>
        </div>
      </div>
    </div>
  );
}


/* =========================================================
   POST DETAIL
========================================================= */

function PostDetail({
  id,
  viewer,
}: {
  id: string;
  viewer?: User;
}) {
  const [post, setPost] =
    useState<any | null>(null);

  const [error, setError] =
    useState('');

  useEffect(() => {
    let cancelled = false;

    api(`/posts/${id}`)
      .then((result) => {
        if (!cancelled) {
          setPost(result.post);
        }
      })
      .catch((e) => {
        if (!cancelled) {
          setError(e.message);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [id]);


  if (error) {
    return (
      <div className="page">
        <div className="error">
          {error}
        </div>
      </div>
    );
  }


  if (!post) {
    return (
      <div className="page">
        <div className="loading">
          Loading post…
        </div>
      </div>
    );
  }


  return (
    <div className="page narrow">
      <a
        className="back-link"
        href="/feed"
      >
        ← Back to posts
      </a>

      <div className="detail-post">
        <Post
          post={post}
          viewer={viewer}
          onChanged={() => {
            /*
             * Intentionally left empty.
             *
             * Votes, saves, replies, edits and deletes
             * are reconciled locally. We do NOT refresh
             * the whole post after every interaction.
             */
          }}
        />
      </div>
    </div>
  );
}


export {
  Feed,
  Post,
  Comment,
  PostDetail,
};

