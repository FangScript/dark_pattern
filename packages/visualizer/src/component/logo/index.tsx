import './index.less';

// Dark Pattern Hunter Logo - using extension icon
export const LogoUrl = 'chrome-extension://__MSG_@@extension_id__/icon128.png';

export const Logo = ({ hideLogo = false }: { hideLogo?: boolean }) => {
  if (hideLogo) {
    return null;
  }

  return (
    <div className="logo">
      <img alt="Dark Pattern Hunter Logo" src={LogoUrl} />
    </div>
  );
};
