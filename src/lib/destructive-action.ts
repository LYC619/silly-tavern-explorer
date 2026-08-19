interface DeleteFeedback {
  onSuccess: () => void;
  onFailure: (error: unknown) => void;
}

/** 统一删除动作的结果分流，确保每个入口都有成功或失败反馈。 */
export async function executeDeleteAction(
  action: () => void | Promise<void>,
  feedback: DeleteFeedback,
): Promise<boolean> {
  try {
    await action();
    feedback.onSuccess();
    return true;
  } catch (error) {
    feedback.onFailure(error);
    return false;
  }
}
