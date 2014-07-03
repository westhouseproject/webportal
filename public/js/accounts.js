

var users = angular.module('users', []);


users.controller(
  'UsersController',
  [
    '$scope',
    '$http',
    function ($scope, $http) {
      $scope.users = [];

      $scope.hasUnverified = function (users) {
        return _.some(users, function (user) {
          return !user.verified;
        });
      };


      $http({method: 'GET', url: '/users'})
        .success(function (data, status, headers, config) {
          $scope.users = data;
        });
    }
  ]
);