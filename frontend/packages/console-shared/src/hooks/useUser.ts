import { useEffect, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { getUser, getUserResource, setUserResource } from '@console/dynamic-plugin-sdk';
import { useK8sGet } from '@console/internal/components/utils/k8s-get-hook';
import { UserModel } from '@console/internal/models';
import type { UserKind } from '@console/internal/module/k8s/types';
import { useConsoleDispatch } from '@console/shared/src/hooks/useConsoleDispatch';
import { useConsoleSelector } from '@console/shared/src/hooks/useConsoleSelector';

/**
 * Custom hook that provides centralized user data fetching and management.
 * This hook fetches both the UserInfo (from authentication) and UserKind (from k8s API)
 * and stores them in Redux for use throughout the application.
 *
 * Note: The User API (user.openshift.io/v1) is not available when using BYO External
 * Authentication (OIDC). A 404 error in this case is expected and should not block
 * functionality, as user information is also available through other APIs.
 *
 * @returns Object containing user info, user resource, and loading states
 */
export const useUser = () => {
  const { t } = useTranslation('public');
  const dispatch = useConsoleDispatch();

  // Get current user info from Redux (username, groups, etc.)
  const user = useConsoleSelector(getUser);

  // Get current user resource from Redux (fullName, identities, etc.)
  const userResource = useConsoleSelector(getUserResource);

  // Fetch user resource from k8s API
  // Note: This API may not be available with BYO External Auth (404 is expected)
  const [userResourceData, userResourceLoaded, userResourceError] = useK8sGet<UserKind>(
    UserModel,
    '~',
  );

  // Filter out 404 errors - they are expected when User API is not available
  // (e.g., with BYO External Authentication)
  const actualError = useMemo(() => {
    if (!userResourceError) {
      return null;
    }
    // Check if this is a 404 error (User API not available)
    const is404 =
      userResourceError?.response?.status === 404 ||
      userResourceError?.json?.code === 404 ||
      userResourceError?.message?.includes('404');

    if (is404) {
      // Log for debugging but don't surface as an error
      // eslint-disable-next-line no-console
      console.debug(
        'User API not available (404) - this is expected with BYO External Authentication',
      );
      return null;
    }
    return userResourceError;
  }, [userResourceError]);

  // Update Redux when user resource is loaded
  useEffect(() => {
    if (userResourceLoaded && userResourceData && !userResourceError) {
      dispatch(setUserResource(userResourceData));
    }
  }, [dispatch, userResourceData, userResourceLoaded, userResourceError]);

  const currentUserResource = userResource || userResourceData;
  const currentUsername = user?.username;
  const currentFullName = currentUserResource?.fullName;

  // Create a robust display name that always has a fallback
  const getDisplayName = () => {
    // Prefer fullName if it exists and is not empty
    if (currentFullName && currentFullName.trim()) {
      return currentFullName.trim();
    }
    // Fallback to username if it exists and is not empty
    if (currentUsername && currentUsername.trim()) {
      return currentUsername.trim();
    }
    // Final fallback for edge cases
    return t('Unknown user');
  };

  return {
    user,
    userResource: currentUserResource,
    userResourceLoaded,
    userResourceError: actualError,
    // Computed properties for convenience
    username: currentUsername,
    fullName: currentFullName,
    displayName: getDisplayName(),
  };
};
