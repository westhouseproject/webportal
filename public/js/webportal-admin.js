angular.module('navbar', [])
  .controller(
    'NavbarController',
    [
      '$scope',
      '$http',
      function ($scope, $http) {
        $scope.users = [];

        $scope.unverifiedCount = function () {
          return _.filter($scope.users, function (user) {
            return !user.verified;
          }).length;
        };

        $http({ method: 'GET', url: '/users'})
          .success(function (data, status, headers, config) {
            $scope.users = data;
          });

        (function longPoll() {
          $http({ method: 'GET', url: '/longpoll' })
            .success(function (data, status, headers, config) {
              $scope.users = data;
              longPoll();
            });
        }());
      }
    ]
  );
