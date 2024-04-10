const mongoose = require("mongoose");
const { boolean } = require("yargs");
const Schema = mongoose.Schema;

const CommunitySchema = new Schema({
  name: {
    type: String,
    unique: [true, "A community with this name already exists"],
    required: [true, "You must enter a name for the community"],
    trim: true,
    maxlength: 30,
  },
  category: {
    type: String,
    trim: true,
    maxlength: 30,
  },
  rules: {
    type: [Schema.Types.ObjectId],
    ref: "rule",
    index: true,
  },
  dateCreated: {
    type: Date,
    default: Date.now,
  },
  communityBanner: {
    type: String,
    format: "url",
    description: "Link to the banner of the community",
  },
  image: {
    type: String,
    format: "url",
    description: "Link to the image of the community",
  },
  description: {
    type: String,
    trim: true,
    maxlength: 200,
    default: "",
  },
  is18plus: {
    type: Boolean,
    default: "false",
  },
  allowNfsw: {
    type: Boolean,
    default: "true",
  },
  allowSpoile: {
    type: Boolean,
    default: "true",
  },
  communityType: {
    type: String,
    enum: ["Public", "Restricted", "Private"],
    default: "Public",
  },
  creator: {
    type: Schema.Types.ObjectId,
    required: [true, "A community must have a creator."],
    ref: "user",
  },
  members: {
    type: [Schema.Types.ObjectId],
    required: [true, "A community must have at least one member."],
    ref: "user",
    index: true,
  },
  // Note: I din't make it required for the community to have at least one moderator as the creator is the first moderator of the community. Moderators are supposed to have less privileges than creator of the community
  moderators: {
    type: [Schema.Types.ObjectId],
    ref: "user",
    index: true,
  },

  //todo add the community settings attributes
  //todo figure out mawdo3 el moderator how is it gonna be saved array or something else?
  //todo mawdo3 el nas ely fi el community how are we gonna save them as well?
  //todo helper function verfiying that the community
});

CommunitySchema.statics.checkExistence = async function (name) {
  const community = await Community.findOne({ name });
  if (community) {
    return true;
  } else {
    return false;
  }
};
CommunitySchema.statics.isUserInCommunity = async function (
  userId,
  communityName
) {
  const community = await this.findOne({ name: communityName }).exec();
  if (!community) {
    return false;
  }
  const members = await User.find({ _id: { $in: community.members } }).exec();
  const memberIds = members.map((member) => member._id.toString());
  return memberIds.includes(userId.toString());
};
CommunitySchema.statics.getMembersCount = async function (communityId) {
  try {
    const community = await this.findById(communityId).exec();
    if (!community) {
      return 0;
    }
    return community.members.length;
  } catch (error) {
    console.error("Error while getting members count:", error);
    return 0;
  }
};
const Community = mongoose.model("community", CommunitySchema);

module.exports = Community;
