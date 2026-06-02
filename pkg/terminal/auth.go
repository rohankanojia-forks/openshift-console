package terminal

import (
	"context"
	"errors"

	authv1 "k8s.io/api/authorization/v1"
	v1 "k8s.io/api/authentication/v1"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"

	"github.com/openshift/console/pkg/auth"
)

var errMissingUserUID = errors.New("user must have UID to proceed authorization")

// isClusterAdmin does a subject access review to see if the user can create pods in openshift-terminal
// if they can then they are considered a cluster admin
// if they cannot they are not a cluster admin
func (p *Proxy) isClusterAdmin(token string) (bool, error) {
	client, err := p.createTypedClient(token)
	if err != nil {
		return false, err
	}

	sar := &authv1.SelfSubjectAccessReview{
		Spec: authv1.SelfSubjectAccessReviewSpec{
			ResourceAttributes: &authv1.ResourceAttributes{
				Namespace: "openshift-terminal",
				Verb:      "create",
				Resource:  "pods",
			},
		},
	}
	res, err := client.AuthorizationV1().SelfSubjectAccessReviews().Create(context.TODO(), sar, metav1.CreateOptions{})
	if err != nil || res == nil {
		return false, err
	}
	return res.Status.Allowed, nil
}

// getKubernetesUserUID resolves the authenticated user's Kubernetes UID via SelfSubjectReview.
// This works with all authentication methods including BYO External Authentication, where the
// OpenShift User API (user.openshift.io/v1) is not available and auth.User.ID may contain an
// OIDC subject that does not match the DevWorkspace creator label.
func (p *Proxy) getKubernetesUserUID(ctx context.Context, user *auth.User) (string, error) {
	client, err := p.createTypedClient(user.Token)
	if err != nil {
		return "", err
	}

	userInfo, err := client.AuthenticationV1().SelfSubjectReviews().Create(ctx, &v1.SelfSubjectReview{}, metav1.CreateOptions{})
	if err != nil {
		return "", err
	}

	userId := userInfo.Status.UserInfo.UID
	if userId == "" && userInfo.Status.UserInfo.Username != "kube:admin" {
		return "", errMissingUserUID
	}
	return userId, nil
}
