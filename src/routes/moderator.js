const express = require("express");
const User = require("../models/user.js");
const cookieParser = require("cookie-parser");
const passport = require("passport");
const router = express.Router();
const Community = require("../models/community.js");
const Rule = require("../models/rule.js");
const RemovalReason = require("../models/removalReason.js");
const Moderator = require("../models/moderator.js");
router.use(passport.initialize());
router.use(cookieParser("spreaditsecret"));
const auth = require("../middleware/authentication");

router.post("/rule/add", auth.authentication, async (req, res) => {
  try {
    const { title, description, reportReason, communityName, appliesTo } = req.body;

    if (!title || !communityName) {
      return res.status(400).json({ message: "Invalid rule data" });
    }
    if (
      title.length > 100 ||
      (description && description.length > 500) ||
      (reportReason && reportReason.length > 100)
    ) {
      return res.status(400).json({ message: "Invalid rule data" });
    }
    let existingRule = await Rule.findOne({
      title: title,
      communityName: communityName,
    });

    if (existingRule) {
      return res.status(403).json({ message: "Title already used" });
    }

    const ruleReportReason = reportReason || title;

    const ruleAppliesTo = appliesTo && ["posts", "comments", "both"].includes(appliesTo) ? appliesTo : "both";

    existingRule = new Rule({
      title: title,
      description: description || "",
      reportReason: ruleReportReason,
      communityName: communityName,
      appliesTo: ruleAppliesTo,
    });

    const userId = req.user._id;
    const user = await User.findById(userId);
    const community = await Community.findOne({ name: communityName });

    if (!community) {
      return res.status(404).json({ message: "Community not found" });
    }

    if (!community.moderators.includes(user._id)) {
      return res.status(402).json({ message: "You are not a moderator of this community" });
    }

    if (community.rules.length >= 15) {
      return res.status(405).json({ message: "Max number of rules reached" });
    }
    const moderator = community.moderatorPermissions.find((moderator) => moderator.username === user.username);
    if (!moderator || !moderator.manageSettings) {
      return res.status(406).json({ message: "Moderator doesn't have permission to manage settings" });
    }
    await existingRule.save();
    community.rules.push(existingRule._id);
    await community.save();
    res.status(200).json({ message: "Rule added successfully" });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Internal server error" });
  }
});

router.post("/rule/remove", auth.authentication, async (req, res) => {
  try {
    const { communityName, title } = req.body;

    if (!communityName || !title) {
      return res.status(400).json({ message: "Invalid request parameters" });
    }

    const userId = req.user._id;
    const user = await User.findById(userId);
    const community = await Community.findOne({ name: communityName });

    if (!community) {
      return res.status(404).json({ message: "Community not found" });
    }

    if (!community.moderators.includes(user._id)) {
      return res.status(402).json({ message: "Not a moderator" });
    }

    const rule = await Rule.findOne({ title: title });

    if (!rule) {
      return res.status(404).json({ message: "Rule not found" });
    }

    const index = community.rules.indexOf(rule._id);
    if (index == -1) {
      return res.status(404).json({ message: "Rule not found" });
    }
    const moderator = community.moderatorPermissions.find((moderator) => moderator.username === user.username);
    if (!moderator || !moderator.manageSettings) {
      return res.status(406).json({ message: "Moderator doesn't have permission to manage settings" });
    }
    community.rules.splice(index, 1);
    await community.save();
    await Rule.findByIdAndDelete(rule._id);
    res.status(200).json({ message: "Rule removed successfully" });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Internal server error" });
  }
});

router.put("/rule/edit", auth.authentication, async (req, res) => {
  try {
    const { communityName, oldTitle, newRule } = req.body;

    const { title, description, reportReason, appliesTo } = newRule;
    if (!title || !communityName) {
      return res.status(400).json({ message: "Invalid rule data" });
    }

    if (
      title.length > 100 ||
      (description && description.length > 500) ||
      (reportReason && reportReason.length > 100)
    ) {
      return res.status(400).json({ message: "Invalid rule data" });
    }

    const userId = req.user._id;
    const user = await User.findById(userId);
    const community = await Community.findOne({ name: communityName });

    if (!community) {
      return res.status(404).json({ message: "Community not found" });
    }

    if (!community.moderators.includes(user._id)) {
      return res.status(402).json({ message: "Not a moderator" });
    }

    const moderator = community.moderatorPermissions.find((moderator) => moderator.username === user.username);
    if (!moderator || !moderator.manageSettings) {
      return res.status(406).json({ message: "Moderator doesn't have permission to manage settings" });
    }

    const rule = await Rule.findOne({ title: oldTitle, communityName: communityName });

    if (!rule) {
      return res.status(404).json({ message: "Rule not found" });
    }

    rule.title = title;
    rule.description = description || "";
    rule.reportReason = reportReason || title;
    rule.appliesTo = appliesTo && ["posts", "comments", "both"].includes(appliesTo) ? appliesTo : "both";

    await rule.save();
    res.status(200).json({ message: "Rule edited successfully" });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Internal server error" });
  }
});

router.get("/community/:communityName/rules", auth.authentication, async (req, res) => {
  try {
    const communityName = req.params.communityName;

    if (!communityName) {
      return res.status(400).json({ message: "Invalid request parameters" });
    }

    const community = await Community.findOne({ name: communityName });

    if (!community) {
      return res.status(404).json({ message: "Community not found" });
    }

    const rules = await Rule.find({ communityName: communityName });

    res.status(200).json(rules);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Internal server error" });
  }
});

router.post("/removal-reason/add", auth.authentication, async (req, res) => {
  try {
    const { title, reasonMessage, communityName } = req.body;

    if (!title || !communityName || !reasonMessage) {
      return res.status(400).json({ message: "Invalid removal reason data" });
    }

    const community = await Community.findOne({ name: communityName });

    if (!community) {
      return res.status(404).json({ message: "Community not found" });
    }

    if (!community.moderators.includes(req.user._id)) {
      return res.status(402).json({ message: "You are not a moderator of this community" });
    }

    if (community.removalReasons.length >= 50) {
      return res.status(405).json({ message: "Max number of removal reasons reached" });
    }

    const moderator = community.moderatorPermissions.find((moderator) => moderator.username === req.user.username);
    if (!moderator || !moderator.manageSettings) {
      return res.status(406).json({ message: "Moderator doesn't have permission" });
    }
    const removalReason = new RemovalReason({
      title,
      reasonMessage,
      communityName,
    });

    await removalReason.save();
    community.removalReasons.push(removalReason._id);
    await community.save();
    res.status(200).json({ message: "Removal reason added successfully" });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Internal server error" });
  }
});

router.post("/removal-reason/remove", auth.authentication, async (req, res) => {
  try {
    const { communityName, rId } = req.body;

    if (!communityName || !rId) {
      return res.status(400).json({ message: "Invalid request parameters" });
    }

    const community = await Community.findOne({ name: communityName });

    if (!community) {
      return res.status(404).json({ message: "Community not found" });
    }

    if (!community.moderators.includes(req.user._id)) {
      return res.status(402).json({ message: "Not a moderator" });
    }

    const index = community.removalReasons.findIndex((reason) => reason._id.toString() === rId);

    if (index === -1) {
      return res.status(404).json({ message: "Removal reason not found" });
    }

    const moderator = community.moderatorPermissions.find((moderator) => moderator.username === req.user.username);
    if (!moderator || !moderator.manageSettings) {
      return res.status(406).json({ message: "Moderator doesn't have permission" });
    }

    community.removalReasons.splice(index, 1);
    await community.save();
    await RemovalReason.findByIdAndDelete(rId);
    res.status(200).json({ message: "Removal reason removed successfully" });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Internal server error" });
  }
});

router.put("/removal-reason/edit", auth.authentication, async (req, res) => {
  try {
    const { communityName, rId, newRemovalReason } = req.body;

    if (!communityName || !rId || !newRemovalReason) {
      return res.status(400).json({ message: "Invalid removal reason data" });
    }
    const { title, reasonMessage } = newRemovalReason;
    if (!title || !reasonMessage) {
      return res.status(400).json({ message: "Invalid removal reason data" });
    }
    const community = await Community.findOne({ name: communityName });

    if (!community) {
      return res.status(404).json({ message: "Community not found" });
    }

    if (!community.moderators.includes(req.user._id)) {
      return res.status(402).json({ message: "You are not a moderator of this community" });
    }

    const moderator = community.moderatorPermissions.find((moderator) => moderator.username === req.user.username);
    if (!moderator || !moderator.manageSettings) {
      return res.status(406).json({ message: "Moderator doesn't have permission" });
    }

    const removalReason = await RemovalReason.findById(rId);

    if (!removalReason) {
      return res.status(404).json({ message: "Removal Reason not found" });
    }

    removalReason.title = title;
    removalReason.reasonMessage = reasonMessage;

    await removalReason.save();

    res.status(200).json({ message: "Removal reason edited successfully" });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Internal server error" });
  }
});

router.get("/community/:communityName/removal-reasons", auth.authentication, async (req, res) => {
  try {
    const communityName = req.params.communityName;

    if (!communityName) {
      return res.status(400).json({ message: "Invalid request parameters" });
    }

    const community = await Community.findOne({ name: communityName });

    if (!community) {
      return res.status(404).json({ message: "Community not found" });
    }
    const removalReasons = await RemovalReason.find({ communityName: communityName });

    res.status(200).json(removalReasons);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Internal server error" });
  }
});

router.post("/community/moderation/:communityName/:username/leave", auth.authentication, async (req, res) => {
  try {
    const { communityName, username } = req.params;

    if (!communityName || !username) {
      return res.status(400).json({ message: "Invalid leave request" });
    }

    const user = await User.findOne({ username });
    const community = await Community.findOne({ name: communityName });

    if (!user || !community) {
      return res.status(404).json({ message: "User or community not found" });
    }

    if (!community.moderators.includes(user._id)) {
      return res.status(402).json({ message: "User is not a moderator" });
    }

    const userIndex = community.moderators.indexOf(user._id);
    if (userIndex !== -1) {
      community.moderators.splice(userIndex, 1);
      await community.save();
    }

    const communityIndex = user.moderatedCommunities.indexOf(community._id);
    if (communityIndex !== -1) {
      user.moderatedCommunities.splice(communityIndex, 1);
      await user.save();
    }
    const modIndex = community.moderatorPermissions.indexOf(user._id);
    if (modIndex !== -1) {
      community.moderators.splice(userIndex, 1);
      await community.save();
    }

    await Moderator.deleteOne({ communityName: communityName, username: username });

    res.status(200).json({ message: "Left moderator role successfully" });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Internal server error" });
  }
});

router.get("/community/:communityName/get-info", async (req, res) => {
  try {
    const communityName = req.params.communityName;

    if (!communityName) {
      return res.status(400).json({ message: "Invalid request parameters" });
    }

    const community = await Community.findOne({ name: communityName })
      .select(
        "is18plus name category communityType description image members membersCount rules removalReasons dateCreated communityBanner membersNickname"
      )
      .populate("rules", "title description reportReason appliesTo")
      .populate("removalReasons", "title reasonMessage");

    if (!community) {
      return res.status(404).json({ message: "Community not found" });
    }

    res.status(200).json(community);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Internal server error" });
  }
});

router.get("/community/moderation/:communityName/contributors", auth.authentication, async (req, res) => {
  try {
    const communityName = req.params.communityName;

    const community = await Community.findOne({ name: communityName }).populate(
      "contributors",
      "username banner avatar"
    );
    const user = req.user;

    if (!community) {
      return res.status(404).json({ message: "Community not found" });
    }

    if (!community.moderators.includes(user._id)) {
      return res.status(402).json({ message: "Not a moderator" });
    }

    const contributors = community.contributors.map((contributor) => ({
      username: contributor.username,
      banner: contributor.banner,
      avatar: contributor.avatar,
    }));

    res.status(200).json(contributors);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Internal server error" });
  }
});

router.post("/community/moderation/:communityName/:username/add-contributor", auth.authentication, async (req, res) => {
  try {
    const communityName = req.params.communityName;
    const username = req.params.username;
    const user = req.user;

    const community = await Community.findOne({ name: communityName });

    if (!community) {
      return res.status(404).json({ message: "Community not found" });
    }

    if (!community.moderators.includes(user._id)) {
      return res.status(402).json({ message: "Not a moderator" });
    }

    const contributorUser = await User.findOne({ username });

    if (!contributorUser) {
      return res.status(404).json({ message: "User not found" });
    }

    if (community.contributors.includes(contributorUser._id)) {
      return res.status(405).json({ message: "User is already a contributor" });
    }
    const moderator = community.moderatorPermissions.find((moderator) => moderator.username === req.user.username);
    if (!moderator || !moderator.manageUsers) {
      return res.status(406).json({ message: "Moderator doesn't have permission" });
    }

    community.contributors.push(contributorUser._id);
    await community.save();

    res.status(200).json({ message: "User added as contributor successfully" });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Internal server error" });
  }
});

router.delete(
  "/community/moderation/:communityName/:username/remove-contributor",
  auth.authentication,
  async (req, res) => {
    try {
      const communityName = req.params.communityName;
      const username = req.params.username;
      const user = req.user;

      const community = await Community.findOne({ name: communityName });

      if (!community) {
        return res.status(404).json({ message: "Community not found" });
      }

      if (!community.moderators.includes(user._id)) {
        return res.status(402).json({ message: "Not a moderator" });
      }

      const contributorUser = await User.findOne({ username });

      if (!contributorUser) {
        return res.status(404).json({ message: "User not found" });
      }

      if (!community.contributors.includes(contributorUser._id)) {
        return res.status(405).json({ message: "User is not a contributor" });
      }

      const contributorIndex = community.contributors.indexOf(contributorUser._id);

      community.contributors.splice(contributorIndex, 1);
      await community.save();

      res.status(200).json({ message: "User removed as contributor successfully" });
    } catch (error) {
      console.error(error);
      res.status(500).json({ message: "Internal server error" });
    }
  }
);

router.get("/community/moderation/:communityName/:username/is-contributor", auth.authentication, async (req, res) => {
  try {
    const communityName = req.params.communityName;
    const username = req.params.username;

    const community = await Community.findOne({ name: communityName });

    if (!community) {
      return res.status(404).json({ message: "Community not found" });
    }

    const contributorUser = await User.findOne({ username });

    if (!contributorUser) {
      return res.status(404).json({ message: "User not found" });
    }

    const isContributor = community.contributors.includes(contributorUser._id);

    res.status(200).json({ isContributor });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Internal server error" });
  }
});

router.post("/community/:communityName/edit-info", auth.authentication, async (req, res) => {
  try {
    const communityName = req.params.communityName;
    const { name, is18plus, communityType, description, image, communityBanner, membersNickname } = req.body;

    if (!communityName) {
      return res.status(400).json({ message: "Invalid request parameters" });
    }

    const user = req.user;
    const community = await Community.findOne({ name: communityName });

    if (!community) {
      return res.status(404).json({ message: "Community not found" });
    }
    const existingCommunity = await Community.findOne({ name });
    if (existingCommunity) {
      return res.status(402).json({ message: "Community name is used" });
    }
    const moderator = community.moderatorPermissions.find((moderator) => moderator.username === user.username);

    if (!moderator || !moderator.manageSettings) {
      return res.status(406).json({ message: "Moderator doesn't have permission" });
    }

    community.name = name || community.name;
    community.is18plus = is18plus || community.is18plus;
    community.communityType = communityType || community.communityType;
    community.description = description || community.description;
    community.image = image || community.image;
    community.communityBanner = communityBanner || community.communityBanner;
    community.membersNickname = membersNickname || community.membersNickname;

    await community.save();

    res.status(200).json({ message: "Community information updated successfully" });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Internal server error" });
  }
});

router.get("/community/:communityName/settings", auth.authentication, async (req, res) => {
  try {
    const communityName = req.params.communityName;

    if (!communityName) {
      return res.status(400).json({ message: "Invalid request parameters" });
    }

    const user = req.user;
    const community = await Community.findOne({ name: communityName });

    if (!community) {
      return res.status(404).json({ message: "Community not found" });
    }

    const moderator = community.moderatorPermissions.find((moderator) => moderator.username === user.username);

    if (!moderator || !moderator.manageSettings) {
      return res.status(406).json({ message: "Moderator doesn't have permission" });
    }

    res.status(200).json(community.settings);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Internal server error" });
  }
});

router.put("/community/:communityName/settings", auth.authentication, async (req, res) => {
  try {
    const communityName = req.params.communityName;
    const user = req.user;
    if (!communityName) {
      return res.status(400).json({ message: "Invalid request parameters" });
    }
    const {
      postTypeOptions,
      spoilerEnabled,
      multipleImagesPerPostAllowed,
      pollsAllowed,
      commentSettings: { mediaInCommentsAllowed },
    } = req.body;

    const community = await Community.findOne({ name: communityName });

    if (!community) {
      return res.status(404).json({ message: "Community not found" });
    }

    if (!community.moderators.includes(user._id)) {
      return res.status(402).json({ message: "Not a moderator" });
    }

    community.postTypeOptions = postTypeOptions;
    community.spoilerEnabled = spoilerEnabled;
    community.multipleImagesPerPostAllowed = multipleImagesPerPostAllowed;
    community.pollsAllowed = pollsAllowed;
    community.commentSettings.mediaInCommentsAllowed = mediaInCommentsAllowed;

    await community.save();

    res.status(200).json({ message: "Community settings updated successfully" });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Internal server error" });
  }
});

router.get("/community/muted", auth.authentication, async (req, res) => {
  try {
    const mutedCommunities = req.user.mutedCommunities;

    if (!mutedCommunities || mutedCommunities.length === 0) {
      return res.status(200).json([]);
    }

    const mutedCommunitiesData = await Community.find({ _id: { $in: mutedCommunities } }).select(
      "name description image membersCount communityBanner"
    );

    res.status(200).json(mutedCommunitiesData);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Internal server error" });
  }
});

router.get("/community/moderation/:communityName/moderators", auth.authentication, async (req, res) => {
  try {
    const communityName = req.params.communityName;
    const community = await Community.findOne({ name: communityName }).populate(
      "moderators",
      "username banner avatar createdat managePostsAndComments manageUsers manageSettings",
      null,
      { select: { createdat: "moderationDate" } }
    );
    if (!community) {
      return res.status(404).json({ message: "Community not found" });
    }
    res.status(200).json(community.moderators);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Internal server error" });
  }
});

router.get("/community/moderation/:communityName/moderators/editable", auth.authentication, async (req, res) => {
  try {
    const communityName = req.params.communityName;
    const user = req.user;

    const userUsername = user.username;

    const community = await Community.findOne({ name: communityName });
    if (!community) {
      return res.status(404).json({ message: "Community not found" });
    }

    const moderators = await Moderator.find({ username: { $in: community.moderatorPermissions } });

    moderators.sort((a, b) => a.createdAt - b.createdAt);

    const userModerator = moderators.find((moderator) => moderator.username === userUsername);

    if (userModerator) {
      const index = moderators.indexOf(userModerator);
      if (index !== -1) {
        moderators.splice(index, 1);
        moderators.unshift(userModerator);
      }
    }

    const userCreationDate = user.createdAt;
    const editableModerators = moderators.filter((moderator) => moderator.createdAt > userCreationDate);

    res.status(200).json(editableModerators);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Internal server error" });
  }
});

module.exports = router;
