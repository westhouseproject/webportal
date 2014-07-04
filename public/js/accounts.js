angular.module('accounts', [])
  .controller(
    'UsersController',
    [
      '$scope',
      '$http',
      function ($scope, $http) {
        $scope.users = [];
        $scope.currentUserID = userID;

        $scope.hasUnverified = function (users) {
          return _.some(users, function (user) {
            return !user.verified;
          });
        };

        $scope.pendingApproval = function (users) {
          return _.some(users, function (user) {
            return user.pendingApproval;
          });
        };

        $scope.removeUser = function (user) {
          $http({method: 'DELETE', url: '/users/' + user._id})
            .success(function (data, status, headers, config) {
              for (var i = 0; i < $scope.users.length; i++) {
                if (user._id === $scope.users[i]._id) {
                  break;
                }
              }
              $scope.users =
                $scope.users.slice(0, i).concat($scope.users.slice(i + 1));
            });
        };

        $scope.verify = function () {
          var toVerify = _.filter($scope.users, function (user) {
            return user.pendingApproval;
          });
          async.each(toVerify, function (user, callback) {
            var sanitized = {};
            for (var key in user) {
              if (key !== '_id') {
                sanitized[key] = user[key]
              }
            }
            var sanitized = {verified: true};
            $http({method: 'PUT', url: '/users/' + user._id, data: sanitized})
              .success(function (data, status, headers, config) {
                user.verified = true;
              })
              .error(function (data, status, headers, config) {
              });
          }, function (err) {

          });
        };

        $http({method: 'GET', url: '/users'})
          .success(function (data, status, headers, config) {
            $scope.users = data;
          });
      }
    ]
  );
