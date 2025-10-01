import mongoose from "mongoose";

const TaskSchema = new mongoose.Schema(
  {
    _id: { type: String, required: true }, // uuid v4
    topicId: { type: String, required: true }, // uuid v4
    title: { type: String, required: true },
    description: { type: String, default: "" },
    status: { type: String, default: "open" },
    createdBy: { type: String, default: "system" },
  },
  { timestamps: true }
);

TaskSchema.index({ topicId: 1 });

export default mongoose.models.Task || mongoose.model("Task", TaskSchema);
