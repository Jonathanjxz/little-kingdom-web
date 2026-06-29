interface ErrorBannerProps {
  message?: string;
  onDismiss?: () => void;
}

export function ErrorBanner({ message, onDismiss }: ErrorBannerProps) {
  if (!message) return null;
  return (
    <div className="formal-error" role="alert" data-testid="error-message">
      <strong>操作未完成</strong>
      <span>{message}</span>
      {onDismiss && (
        <button type="button" onClick={onDismiss} aria-label="关闭错误提示">
          ×
        </button>
      )}
    </div>
  );
}
