import { useEffect, useState } from 'react';
import {
  checkRemoteAutomationServer,
  getDefaultRemoteServerUrl,
} from '../remote-server-client';
import { useEnvConfig } from '../store/store';

export const useServerValid = (shouldRun = true) => {
  const [serverValid, setServerValid] = useState(true);
  const { serviceMode } = useEnvConfig();

  useEffect(() => {
    let interruptFlag = false;
    if (!shouldRun) return;

    Promise.resolve(
      (async () => {
        while (!interruptFlag) {
          const status = await checkRemoteAutomationServer(
            getDefaultRemoteServerUrl(),
          );
          setServerValid(status);
          await new Promise((resolve) => setTimeout(resolve, 1000));
        }
      })(),
    );

    return () => {
      interruptFlag = true;
    };
  }, [serviceMode, shouldRun]);

  return serverValid;
};
