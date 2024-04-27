const mongoose = require("mongoose");
const Schema = mongoose.Schema;
require("./conversation");
require("./user");

const MessageSchema = new Schema(
  {
    conversationId: {
      type: Schema.Types.ObjectId,
      ref: "conversation",
    },
    conversationSubject: {
      type: String,
      required: true,
    },
    isDeleted: {
      type: Boolean,
      default: false,
    },
    senderId: {
      type: Schema.Types.ObjectId,
      required: true,
      ref: "user",
    },
    recieverId: {
      type: Schema.Types.ObjectId,
      required: true,
      ref: "user",
    },

    parentMessageId: {
      // If it's null, then this means that the message itself is a parent message
      type: Schema.Types.ObjectId,
      index: true,
      ref: "message",
      default: null,
    },
    contentType: {
      type: String,
      enum: ["text", "comment", "mention"], // Enum for different content types
      required: true,
    },
    content: {
      type: Schema.Types.Mixed,
      required: true,
    },
    sentTime: {
      type: Date,
      default: Date.now,
    },
    isRead: {
      type: Boolean,
      default: false,
    },
  },
  {
    timestamps: true,
  }
);

MessageSchema.statics.getMessageObject = async function (message, userId) {
  const User = mongoose.model("user");

  let relatedUser;
  let direction;

  // Check if the user is the sender or receiver of the message
  if (message.senderId.equals(userId)) {
    relatedUser = await User.findById(message.recieverId);
    direction = "outgoing";
  } else if (message.recieverId.equals(userId)) {
    relatedUser = await User.findById(message.senderId);
    direction = "incoming";
  }
  const username = relatedUser ? relatedUser.username : null;
  const type = message.contentType;

  return {
    _id: message._id,
    conversationId: message.conversationId,
    relatedUser: username,
    type: type,
    content: message.content,
    time: message.sentTime,
    direction: direction,
    isRead: message.isRead,
    isDeleted: message.isDeleted,
    subject: message.conversationSubject,
  };
};

const Message = mongoose.model("message", MessageSchema);

module.exports = Message;
