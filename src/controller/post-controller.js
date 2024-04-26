const Post = require("../models/post");
const Comment = require("../models/comment.js");
const User = require("../models/user");
const Report = require("../models/report.js");
const Community = require("../models/community.js");
const mongoose = require("mongoose");

const jwt = require("jsonwebtoken");
const schedule = require("node-schedule");
const { uploadMedia } = require("../service/cloudinary.js");

exports.getPostById = async (req, res) => {
  try {
    const userId = req.user._id;
    const postId = req.params.postId;
    if (!postId || postId.length !== 24) {
      return res.status(404).json({ message: "Post not found" });
    }
    const post = await Post.findById(postId);

    if (!post) {
      return res.status(404).json({ error: "Post not found" });
    }

    const user = await User.findById(post.userId); // Fetch user who made the post

    await User.findByIdAndUpdate(
      userId,
      { $addToSet: { recentPosts: postId } },
      { new: true }
    );
    const postObject = await Post.getPostObject(post, userId);
    const isHidden = postObject === null;
    postObject.isHidden = isHidden;

    res.status(200).json(postObject);
  } catch (err) {
    console.error("Error fetching post:", err);
    res.status(500).json({ error: "Internal server error" });
  }
};

exports.getAllUserPosts = async (req, res) => {
  try {
    const username = req.params.username;

    const user = await User.findOne({ username });
    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }
    const userId = user._id;

    const posts = await Post.find({ userId });

    if (!posts || posts.length === 0) {
      return res.status(404).json({ error: "User has no posts" });
    }

    const postInfoArray = await Promise.all(
      posts.map(async (post) => {
        const postObject = await Post.getPostObject(post, userId);

        return postObject;
      })
    );
    const filteredPostInfoArray = postInfoArray.filter((post) => post !== null);
    res.status(200).json(filteredPostInfoArray);
  } catch (err) {
    console.error("Error fetching posts:", err);
    res.status(500).json({ error: "Internal server error" });
  }
};

exports.getAllUserPosts = async (req, res) => {
  try {
    const username = req.params.username;

    const user = await User.findOne({ username });
    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }
    const userId = user._id;

    const posts = await Post.find({ userId });

    if (!posts || posts.length === 0) {
      return res.status(404).json({ error: "User has no posts" });
    }

    const postInfoArray = await Promise.all(
      posts.map(async (post) => {
        const postObject = await Post.getPostObject(post, userId);

        return postObject;
      })
    );
    const currentDate = new Date();
    // Add 10 minutes to the current date
    currentDate.setMinutes(currentDate.getMinutes() + 3);

    // Format the date and time to match the expected input format
    const scheduledDate = `${currentDate.getFullYear()}-${(
      currentDate.getMonth() + 1
    )
      .toString()
      .padStart(2, "0")}-${currentDate
        .getDate()
        .toString()
        .padStart(2, "0")} ${currentDate
          .getHours()
          .toString()
          .padStart(2, "0")}:${currentDate
            .getMinutes()
            .toString()
            .padStart(2, "0")}`;
    const filteredPostInfoArray = postInfoArray.filter((post) => post !== null);
    res.status(200).json(filteredPostInfoArray);
  } catch (err) {
    console.error("Error fetching posts:", err);
    res.status(500).json({ error: "Internal server error" });
  }
};
function scheduleScheduledPost(post, scheduledDate) {
  // Parse scheduledDate to extract date and time components
  const [date, time] = scheduledDate.split(" ");
  const [year, month, day] = date.split("-");
  const [hour, minute] = time.split(":");

  // Create a Date object for the scheduled date and time
  const scheduledDateTime = new Date(year, month - 1, day, hour, minute);

  // Schedule the post using node-schedule
  const job = schedule.scheduleJob(scheduledDateTime, async () => {
    try {
      await post.save();
      console.log(`Scheduled post ${post._id} has been published.`);
    } catch (error) {
      console.error(`Error scheduling post ${post._id}:`, error);
    }
  });

  // Optionally, you can return the job object for further manipulation or tracking
  return job;
}

exports.createPost = async (req, res) => {
  try {
    const userId = req.user._id;
    const user = await User.findById(userId);
    if (!user) {
      return res.status(400).json({ error: "User ID is invalid" });
    }
    const {
      title,
      content,
      community,
      type,
      pollOptions,
      pollVotingLength,
      fileType,
      link,
      isSpoiler,
      isNsfw,
      sendPostReplyNotification,
      scheduledDate,
    } = req.body;
    let pollExpiration, isPollEnabled;
    if (!title || !community) {
      return res.status(400).json({
        error: "Invalid post data. Please provide title and community",
      });
    }
    let attachments = [];
    if (req.files) {
      for (let i = 0; i < req.files.length; i++) {
        const result = await uploadMedia(req.files[i], fileType);
        //const url = `${config.baseUrl}/media/${result.Key}`;
        const url = result.secure_url;
        const attachmentObj = { type: fileType, link: url };
        attachments.push(attachmentObj);
      }
    }
    if (type === "Poll") {
      if (pollVotingLength) {
        const days = parseInt(pollVotingLength.split(" ")[0]);
        if (!isNaN(days)) {
          const expirationDate = new Date();
          expirationDate.setDate(expirationDate.getDate() + days);
          pollExpiration = expirationDate;

          // Schedule the post to disable poll after expiration
          schedule.scheduleJob(pollExpiration, async () => {
            newPost.isPollEnabled = false;
            await newPost.save();
          });
        }
      }
      isPollEnabled = 1;
    }
    // Validate post data based on post type
    if (type === "Post") {
      if (pollOptions || pollVotingLength) {
        return res.status(400).json({
          error: "Regular posts cannot have poll options, pollVotingLength",
        });
      }
    } else if (type === "Images & Video") {
      if (!attachments || attachments.length === 0 || !fileType) {
        return res.status(400).json({
          error: "fileType and files are required for image & video posts",
        });
      }
      if (pollOptions || pollVotingLength || link || content) {
        return res.status(400).json({
          error:
            "Image/video posts cannot have poll options, poll voting length, link, or content",
        });
      }
    } else if (type === "Link") {
      if (!link) {
        return res
          .status(400)
          .json({ error: "link are required for link posts" });
      }
      if (
        (attachments && attachments.length > 0) ||
        pollOptions ||
        pollVotingLength ||
        content
      ) {
        return res.status(400).json({
          error:
            "Link posts cannot have attachments, poll options, poll voting length, or content",
        });
      }
    } else if (type === "Poll") {
      if (!pollOptions || !pollVotingLength) {
        return res.status(400).json({
          error:
            " poll options, and pollVotingLength are required for poll posts",
        });
      }
    }
    /*  const communityObject = await Community.findOne({ name: community });
         if (!communityObject) {
             return res.status(400).json({ error: 'You can only choose communities that you have already joined' });
         }
         const communityObjectID = communityObject._id;
         if (!user.subscribedCommunities.some(id => id.equals(communityObjectID)) && user.username != community) {
             return res.status(400).json({ error: 'You can only choose communities that you have already joined' });
         } */
    /*         if (!user.communities.includes(community)) {
                    return res.status(400).json({ error: 'You can only choose communities that you have already joined' });
                } */
    if (
      type != "Post" &&
      type != "Images & Video" &&
      type != "Link" &&
      type != "Poll"
    ) {
      return res
        .status(400)
        .json({ error: "Invalid post data. Please provide real post type" });
    }

    const newPost = new Post({
      userId,
      username: user.username,
      userProfilePic: user.avatar || "null",
      title,
      content,
      community,
      type,
      pollOptions,
      pollExpiration,
      isPollEnabled,
      pollVotingLength,
      link,
      attachments,
      isSpoiler,
      isNsfw,
      sendPostReplyNotification,
    });
    if (scheduledDate) {
      const job = scheduleScheduledPost(newPost, scheduledDate);
      newPost.scheduledJobId = job.id;
      return res.status(201).json({
        message: "Post scheduled successfully",
        postId: newPost._id,
      });
    } else {
      await newPost.save();
      return res.status(201).json({
        message: "Post created successfully",
        postId: newPost._id,
      });
    }
  } catch (err) {
    console.error("Error creating post:", err);
    return res.status(500).json({ error: "Internal server error" });
  }
};

exports.getAllPostsInCommunity = async (req, res) => {
  try {
    const username = req.user.username;
    const user = await User.findOne({ username });

    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }

    const userId = user._id;
    const community = req.params.community;

    if (!community) {
      return res.status(400).json({ error: "Community name is required" });
    }

    const communityExists = await Community.findOne({ name: community });

    if (!communityExists) {
      return res.status(404).json({ message: "Community not found" });
    }

    const posts = await Post.find({ community });

    if (!posts || posts.length === 0) {
      return res
        .status(404)
        .json({ error: "Posts not found in the specified community" });
    }

    const postInfoArray = await Promise.all(
      posts.map(async (post) => {
        const postObject = await Post.getPostObject(post, userId);
        return postObject;
      })
    );
    const filteredPostInfoArray = postInfoArray.filter((post) => post !== null);
    res.status(200).json(filteredPostInfoArray);
  } catch (err) {
    console.error("Error fetching posts:", err);
    res.status(500).json({ error: "Internal server error" });
  }
};

exports.savePost = async (req, res) => {
  try {
    const { postId } = req.params;
    if (!postId || postId.length !== 24) {
      return res.status(404).json({ message: "Post not found" });
    }
    const userId = req.user._id;
    if (!postId || !userId) {
      return res
        .status(400)
        .json({ error: "Post ID and User ID are required" });
    }

    let post;
    try {
      post = await Post.findById(postId);
    } catch (err) {
      if (err instanceof mongoose.CastError) {
        return res.status(404).json({ error: "Post not found" });
      }
      throw err;
    }
    if (!post) {
      return res.status(404).json({ error: "Post not found" });
    }
    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }
    if (user.savedPosts.includes(postId)) {
      return res.status(400).json({ error: "Post already saved by the user" });
    }

    user.savedPosts.push(postId);
    await user.save();

    return res.status(200).json({ message: "Post saved successfully" });
  } catch (err) {
    console.error("Error saving post:", err);
    return res.status(500).json({ error: "Internal server error" });
  }
};

exports.getSavedPosts = async (req, res) => {
  try {
    const userId = req.user._id;
    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }

    const savedPostIds = user.savedPosts;

    const savedPosts = await Post.find({ _id: { $in: savedPostIds } });

    if (!savedPosts || savedPosts.length === 0) {
      return res.status(404).json({ error: "Saved posts not found" });
    }

    const postInfoArray = await Promise.all(
      savedPosts.map(async (post) => {
        const postObject = await Post.getPostObject(post, userId);
        return postObject;
      })
    );
    const filteredPostInfoArray = postInfoArray.filter((post) => post !== null);
    res.status(200).json(filteredPostInfoArray);
  } catch (err) {
    console.error("Error fetching saved posts:", err);
    res.status(500).json({ error: "Internal server error" });
  }
};

exports.unsavePost = async (req, res) => {
  try {
    const { postId } = req.params;
    if (!postId || postId.length !== 24) {
      return res.status(404).json({ message: "Post not found" });
    }
    const userId = req.user._id;
    if (!postId || !userId) {
      return res
        .status(400)
        .json({ error: "Post ID and User ID are required" });
    }
    let post;
    try {
      post = await Post.findById(postId);
    } catch (err) {
      if (err instanceof mongoose.CastError) {
        return res.status(404).json({ error: "Post not found" });
      }
      throw err;
    }
    if (!post) {
      return res.status(404).json({ error: "Post not found" });
    }

    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }

    const index = user.savedPosts.indexOf(postId);
    if (index === -1) {
      return res.status(400).json({ error: "Post is not saved by the user" });
    }

    user.savedPosts.splice(index, 1);
    await user.save();

    return res.status(200).json({ message: "Post unsaved successfully" });
  } catch (err) {
    console.error("Error unsaving post:", err);
    return res.status(500).json({ error: "Internal server error" });
  }
};

exports.editPost = async (req, res) => {
  try {
    const { postId } = req.params;
    if (!postId || postId.length !== 24) {
      return res.status(404).json({ message: "Post not found" });
    }
    const userId = req.user._id;
    const content = req.body.content;
    if (!postId || !userId) {
      return res
        .status(400)
        .json({ error: "Post ID and User ID are required" });
    }
    const post = await Post.findById(postId);
    const type = post.type;
    const postContent = post.content;
    if (!post) {
      return res.status(404).json({ error: "Post not found" });
    }
    if (post.userId.toString() !== userId.toString()) {
      return res
        .status(403)
        .json({ error: "User is not authorized to edit this post" });
    }
    if (type !== "Post" && type !== "Poll") {
      return res.status(400).json({
        error: "Invalid post type. Only Post or Poll types can be edited",
      });
    }
    if (type === "Post" && (!postContent || postContent.length === 0)) {
      return res
        .status(400)
        .json({ error: "only posts with content can be editited" });
    }
    if (content) post.content.push(content);

    await post.save();

    return res.status(200).json({ message: "Post edited successfully" });
  } catch (err) {
    console.error("Error editing post:", err);
    return res.status(500).json({ error: "Internal server error" });
  }
};

exports.spoilerPostContent = async (req, res) => {
  try {
    const { postId } = req.params;
    if (!postId || postId.length !== 24) {
      return res.status(404).json({ message: "Post not found" });
    }
    const post = await Post.findById(postId);

    if (!post) {
      return res.status(404).json({ error: "Post not found" });
    }
    post.isSpoiler = true;
    await post.save();
    return res
      .status(200)
      .json({ message: "Post content blurred successfully" });
  } catch (error) {
    console.error("Error spoiling post content:", error);
    return res.status(500).json({ error: "Internal server error" });
  }
};

exports.unspoilerPostContent = async (req, res) => {
  try {
    const { postId } = req.params;
    if (!postId || postId.length !== 24) {
      return res.status(404).json({ message: "Post not found" });
    }
    const post = await Post.findById(postId);

    if (!post) {
      return res.status(404).json({ error: "Post not found" });
    }

    post.isSpoiler = false;

    await post.save();
    return res
      .status(200)
      .json({ message: "Post content unblurred successfully" });
  } catch (error) {
    console.error("Error unspoiling post content:", error);
    return res.status(500).json({ error: "Internal server error" });
  }
};

exports.lockPostComments = async (req, res) => {
  try {
    const { postId } = req.params;
    if (!postId || postId.length !== 24) {
      return res.status(404).json({ message: "Post not found" });
    }
    const post = await Post.findById(postId);

    if (!post) {
      return res.status(404).json({ error: "Post not found" });
    }
    post.isCommentsLocked = true;
    await post.save();
    return res
      .status(200)
      .json({ message: "Post comments locked successfully" });
  } catch (error) {
    console.error("Error locking post comments:", error);
    return res.status(500).json({ error: "Internal server error" });
  }
};

exports.unlockPostComments = async (req, res) => {
  try {
    const { postId } = req.params;
    if (!postId || postId.length !== 24) {
      return res.status(404).json({ message: "Post not found" });
    }
    const post = await Post.findById(postId);

    if (!post) {
      return res.status(404).json({ error: "Post not found" });
    }

    post.isCommentsLocked = false;
    await post.save();
    return res
      .status(200)
      .json({ message: "Post comments unlocked successfully" });
  } catch (error) {
    console.error("Error unlocking post comments:", error);
    return res.status(500).json({ error: "Internal server error" });
  }
};

exports.upvotePost = async (req, res) => {
  try {
    const { postId } = req.params;
    if (!postId || postId.length !== 24) {
      return res.status(404).json({ message: "Post not found" });
    }
    const userId = req.user._id;

    const post = await Post.findById(postId);

    if (!post) {
      return res.status(404).send({
        message: "post not found",
      });
    }
    const downvotesCount = post.downVotes.length;

    const downvoteIndex = post.downVotes.indexOf(userId);
    const upvoteIndex = post.upVotes.indexOf(userId);
    if (downvoteIndex !== -1) {
      post.downVotes.splice(downvoteIndex, 1);
      post.upVotes.push(userId);
    } else if (upvoteIndex !== -1) {
      post.upVotes.splice(downvoteIndex, 1);
    } else {
      post.upVotes.push(userId);
    }

    await post.save();
    const upvotesCount = post.upVotes.length;
    const newdownvotesCount = post.downVotes.length;
    const netVotes = upvotesCount - newdownvotesCount;

    res.status(200).send({
      votes: netVotes,
      message: "post has been upvoted successfully",
    });
  } catch (err) {
    res.status(500).send(err.toString());
  }
};

exports.downvotePost = async (req, res) => {
  try {
    const { postId } = req.params;
    if (!postId || postId.length !== 24) {
      return res.status(404).json({ message: "Post not found" });
    }
    const userId = req.user._id;

    const post = await Post.findById(postId);

    if (!post) {
      return res.status(404).send({
        message: "post not found",
      });
    }
    const upvotesCount = post.upVotes.length;

    const downvoteIndex = post.downVotes.indexOf(userId);
    const upvoteIndex = post.upVotes.indexOf(userId);
    if (downvoteIndex !== -1) {
      post.downVotes.splice(downvoteIndex, 1);
    } else if (upvoteIndex !== -1) {
      post.upVotes.splice(upvoteIndex, 1);
      post.downVotes.push(userId);
    } else {
      post.downVotes.push(userId);
    }

    await post.save();
    const downvotesCount = post.downVotes.length;
    const newupvotesCount = post.upVotes.length;
    const netVotes = newupvotesCount - downvotesCount;

    res.status(200).send({
      votes: netVotes,
      message: "post has been downvoted successfully",
    });
  } catch (err) {
    res.status(500).send(err.toString());
  }
};

exports.getUpvotedPosts = async (req, res) => {
  try {
    const userId = req.user._id;
    const posts = await Post.find({ upVotes: userId });

    if (!posts || posts.length === 0) {
      return res.status(404).json({ error: "Posts not found" });
    }

    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }

    const postInfoArray = await Promise.all(
      posts.map(async (post) => {
        const postObject = await Post.getPostObject(post, userId);
        return postObject;
      })
    );

    const filteredPostInfoArray = postInfoArray.filter((post) => post !== null);

    res.status(200).json(filteredPostInfoArray);
  } catch (err) {
    console.error("Error fetching upvoted posts:", err);
    res.status(500).json({ error: "Internal server error" });
  }
};

exports.getDownvotedPosts = async (req, res) => {
  try {
    const userId = req.user._id;
    const posts = await Post.find({ downVotes: userId });

    if (!posts || posts.length === 0) {
      return res.status(404).json({ error: "Posts not found" });
    }

    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }

    const postInfoArray = await Promise.all(
      posts.map(async (post) => {
        const postObject = await Post.getPostObject(post, userId);
        return postObject;
      })
    );

    const filteredPostInfoArray = postInfoArray.filter((post) => post !== null);

    res.status(200).json(filteredPostInfoArray);
  } catch (err) {
    console.error("Error fetching downvoted posts:", err);
    res.status(500).json({ error: "Internal server error" });
  }
};

exports.deletePost = async (req, res) => {
  try {
    const { postId } = req.params;
    if (!postId || postId.length !== 24) {
      return res.status(404).json({ message: "Post not found" });
    }
    const userId = req.user._id;
    const post = await Post.findByIdAndDelete({ _id: postId, userId });
    if (!post) {
      return res.status(404).json({ error: "Post not found" });
    }
    await deleteComments(postId);
    res.status(200).json({ message: "Post deleted successfully" });
  } catch (err) {
    console.error("Error deleting post:", err);
    res.status(500).json({ error: "Internal server error" });
  }
};

async function deleteComments(postId) {
  const comments = await Comment.find({ postId });
  await Comment.deleteMany({ postId });
  for (const comment of comments) {
    await deleteReplies(comment._id);
  }
}

async function deleteReplies(commentId) {
  const replies = await Comment.find({ parentCommentId: commentId });
  if (replies.length === 0) {
    return;
  }
  await Comment.deleteMany({ parentCommentId: commentId });
  for (const reply of replies) {
    await deleteReplies(reply._id);
  }
}

exports.hidePost = async (req, res) => {
  try {
    const { postId } = req.params;
    if (!postId || postId.length !== 24) {
      return res.status(404).json({ message: "Post not found" });
    }

    const userId = req.user._id;

    const post = await Post.findById(postId);
    if (!post) {
      return res.status(404).json({ message: "Post not found" });
    }
    if (post.hiddenBy.includes(userId)) {
      return res
        .status(400)
        .json({ message: "Post is already hidden by the user" });
    }
    post.hiddenBy.push(userId);
    await post.save();

    const user = await User.findById(userId);
    user.hiddenPosts.push(postId);
    await user.save();

    return res.status(200).json({ message: "Post hidden successfully" });
  } catch (error) {
    console.error("Error hiding post:", error);
    return res.status(500).json({ error: "Internal server error" });
  }
};

exports.unhidePost = async (req, res) => {
  try {
    const { postId } = req.params;
    if (!postId || postId.length !== 24) {
      return res.status(404).json({ message: "Post not found" });
    }
    const userId = req.user._id;

    const post = await Post.findById(postId);

    if (!post) {
      return res.status(404).json({ message: "Post not found" });
    }
    const index = post.hiddenBy.indexOf(userId);
    if (index === -1) {
      return res
        .status(400)
        .json({ message: "Post is not hidden by the user" });
    }
    post.hiddenBy.splice(index, 1);
    await post.save();

    const user = await User.findById(userId);
    const postIndex = user.hiddenPosts.indexOf(postId);
    if (postIndex !== -1) {
      user.hiddenPosts.splice(postIndex, 1);
      await user.save();
    }

    return res.status(200).json({ message: "Post unhidden successfully" });
  } catch (error) {
    console.error("Error unhiding post:", error);
    return res.status(500).json({ error: "Internal server error" });
  }
};

exports.getHiddenPosts = async (req, res) => {
  try {
    const userId = req.user._id;
    const user = await User.findById(userId).populate("hiddenPosts");
    if (!user || !user.hiddenPosts || user.hiddenPosts.length === 0) {
      return res.status(404).json({ message: "No hidden posts found" });
    }

    const hiddenPosts = user.hiddenPosts;
    const postInfoArray = await Promise.all(
      hiddenPosts.map(async (post) => {
        const postObject = await Post.getPostObject(post, userId, true); // Include hidden posts
        return postObject;
      })
    );

    res.status(200).json(postInfoArray);
  } catch (error) {
    console.error("Error fetching hidden posts:", error);
    return res.status(500).json({ error: "Internal server error" });
  }
};

exports.markPostAsNsfw = async (req, res) => {
  try {
    const postId = req.params.postId;
    if (!postId || postId.length !== 24) {
      return res.status(404).json({ message: "Post not found" });
    }
    const post = await Post.findByIdAndUpdate(postId, { isNsfw: true });
    if (!post) {
      return res.status(404).json({ message: "Post not found" });
    }
    res.status(200).json({ message: "Post updated successfully" });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Internal server error" });
  }
};

exports.markPostAsNotNsfw = async (req, res) => {
  const postId = req.params.postId;
  if (!postId || postId.length !== 24) {
    return res.status(404).json({ message: "Post not found" });
  }
  try {
    const post = await Post.findByIdAndUpdate(postId, { isNsfw: false });
    if (!post) {
      return res.status(404).json({ message: "Post not found" });
    }
    res.status(200).json({ message: "Post updated successfully" });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Internal server error" });
  }
};

exports.reportPost = async (req, res) => {
  try {
    const postId = req.params.postId;
    if (!postId || postId.length !== 24) {
      return res.status(404).json({ message: "Post not found" });
    }
    const { reason, subreason } = req.body;
    const userId = req.user._id;

    const post = await Post.findById(postId);
    if (!post) {
      return res.status(404).send({
        message: "post not found",
      });
    }

    if (!reason) {
      return res.status(400).send({
        message: "invalid report data must send reason",
      });
    }

    const report = new Report({
      userId: userId,
      postId: postId,
      reason: reason,
      subreason: subreason,
    });

    await report.save();

    res.status(201).send({
      message: "post reported successfully",
    });
  } catch (error) {
    console.error("Error reporting post:", error);
    res.status(500).send({
      error: "An error occurred while reporting the post",
    });
  }
};

exports.voteInPoll = async (req, res) => {
  try {
    const postId = req.params.postId;
    if (!postId || postId.length !== 24) {
      return res.status(404).json({ message: "Post not found" });
    }
    const { selectedOption } = req.body;

    const userId = req.user._id;
    if (!postId || !selectedOption) {
      return res
        .status(400)
        .json({ error: "Post ID and selected option are required" });
    }

    const post = await Post.findById(postId);
    if (!post) {
      return res.status(404).json({ error: "Post not found" });
    }

    if (post.type !== "Poll") {
      return res
        .status(400)
        .json({ error: "The specified post is not a poll" });
    }

    if (post.votedUsers.includes(userId)) {
      return res
        .status(400)
        .json({ error: "You have already voted in this poll" });
    }

    const optionIndex = post.pollOptions.findIndex(
      (option) => option.option === selectedOption
    );
    if (optionIndex === -1) {
      return res
        .status(404)
        .json({ error: "Selected option not found in the poll" });
    }

    post.pollOptions[optionIndex].votes++;
    post.votedUsers.push(userId);
    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }
    user.selectedPollOption = selectedOption;
    await user.save();
    await post.save();

    return res.status(200).json({ message: "Vote cast successfully" });
  } catch (err) {
    console.error("Error casting vote:", err);
    return res.status(500).json({ error: "Internal server error" });
  }
};

exports.deleteRecentPost = async (req, res) => {
  try {
    const postId = req.params.postId;
    if (!postId || postId.length !== 24) {
      return res.status(404).json({ message: "Post not found" });
    }
    const userId = req.user._id;
    const post = await Post.findById(postId);
    if (!post) {
      return res.status(404).json({ error: "Post not found" });
    }
    const user = await User.findById(userId);
    const isRecent = user.recentPosts.includes(postId);
    if (!isRecent) {
      return res.status(404).json({ error: "Post is not in recent posts" });
    }
    const deleteRecent = await User.findByIdAndUpdate(
      userId,
      { $pull: { recentPosts: postId } },
      { new: true } // To return the updated document after the update operation
    );
    res.status(200).json({ message: "Post deleted from recent successfully" });
  } catch (err) {
    console.error("Error deleting post:", err);
    res.status(500).json({ error: "Internal server error" });
  }
};

