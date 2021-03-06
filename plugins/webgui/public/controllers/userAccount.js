const app = angular.module('app');

app.controller('UserAccountController', ['$scope', '$state', '$stateParams', '$http', 'accountSortDialog','$interval', 'userApi', '$localStorage', 'accountSortTool',
  ($scope, $state, $stateParams, $http, accountSortDialog, $interval, userApi, $localStorage, accountSortTool) => {
    console.log('$scope ===========>>>', $scope)
    $scope.setTitle('Account Number');
    $scope.setMenuRightButton('sort_by_alpha');
    $scope.setMenuSearchButton('search');
    if(!$localStorage.user.accountFilterSettings) {
      $localStorage.user.accountFilterSettings = {
        sort: 'port_asc',
        filter: {
          expired: true,
          unexpired: true,
          unlimit: true,
        },
      };
    }
    $scope.accountMethod = $localStorage.user.accountFilterSettings;
    $scope.accountInfo = {};
    $scope.macAccountInfo = {};
    $scope.sortAndFilter = () => {
      accountSortTool($scope.accountInfo, $scope.accountMethod);
    };
    if(!$localStorage.user.accountInfo) {
      $localStorage.user.accountInfo = {
        time: Date.now(),
        data: [],
      };
    }
    if(!$localStorage.user.macAccountInfo) {
      $localStorage.user.macAccountInfo = {
        time: Date.now(),
        data: [],
      };
    }
    $scope.accountInfo.originalAccount = $localStorage.user.accountInfo.data;
    $scope.accountInfo.account = angular.copy($scope.accountInfo.originalAccount);
    $scope.macAccountInfo.originalAccount = $localStorage.user.macAccountInfo.data;
    $scope.macAccountInfo.account = angular.copy($scope.macAccountInfo.originalAccount);
    $scope.sortAndFilter();
    const getAccountInfo = () => {
      userApi.getAccount().then(accounts => {
        console.log('accounts =========>>>>>>', accounts)
        $localStorage.user.accountInfo = {
          time: Date.now(),
          data: accounts,
        };
        $scope.accountInfo.originalAccount = accounts;
        $scope.accountInfo.account = angular.copy($scope.accountInfo.originalAccount);
        $scope.sortAndFilter();
        return userApi.getMacAccount();
      }).then(macAccounts => {
        // $scope.macAccount = macAccounts;
        $scope.macAccountInfo.originalAccount = macAccounts;
        $scope.macAccountInfo.account = angular.copy($scope.macAccountInfo.originalAccount);
      });
    };
    getAccountInfo();
    $scope.$on('visibilitychange', (event, status) => {
      if(status === 'visible') {
        if($localStorage.user.accountInfo && Date.now() - $localStorage.user.accountInfo.time >= 20 * 1000) {
          getAccountInfo();
        }
      }
    });
    $scope.setInterval($interval(() => {
      if($localStorage.user.accountInfo && Date.now() - $localStorage.user.accountInfo.time >= 90 * 1000) {
        getAccountInfo();
      }
    }, 15 * 1000));
    $scope.setFabButton(() => {
      $state.go('user.addAccount');
    });
    $scope.toAccount = id => {
      $state.go('user.accountPage', { accountId: id });
    };
    $scope.toMacAccount = userId => {
      $state.go('user.userPage', { userId });
    };
    $scope.sortAndFilterDialog = () => {
      accountSortDialog.show($scope.accountMethod, $scope.accountInfo);
    };
    $scope.$on('RightButtonClick', () => {
      $scope.sortAndFilterDialog();
    });
    const accountFilter = () => {
      accountSortTool($scope.accountInfo, $scope.accountMethod);
      $scope.accountInfo.account = $scope.accountInfo.account.filter(f => {
        return (f.port + (f.user ? f.user : '')).indexOf($scope.menuSearch.text) >= 0;
      });
      $scope.macAccountInfo.account = $scope.macAccountInfo.originalAccount.filter(f => {
        return (f.port + f.mac).indexOf($scope.menuSearch.text) >= 0;
      });
    };
    $scope.$on('cancelSearch', () => {
      accountSortTool($scope.accountInfo, $scope.accountMethod);
    });
    $scope.$watch('menuSearch.text', () => {
      if(!$scope.menuSearch.input) {
        return;
      }
      if(!$scope.menuSearch.text) {
        accountSortTool($scope.accountInfo, $scope.accountMethod);
        return;
      }
      accountFilter();
    });
    $scope.accountColor = account => {
      if(account.type === 1) {
        return {
          background: 'blue-50', 'border-color': 'blue-300',
        };
      } else if(account.data && account.data.expire <= Date.now()) {
        return {
          background: 'red-50', 'border-color': 'red-300',
        };
      } else if(account.autoRemove) {
        return {
          background: 'lime-50', 'border-color': 'lime-300',
        };
      }
      return {};
    };
  }
])
.controller('UserAccountPageController', ['$scope', '$state', '$stateParams', '$http', '$mdMedia', '$q', 'payDialog', 'userApi', '$timeout', '$interval', 'qrcodeDialog', 'ipDialog',
  ($scope, $state, $stateParams, $http, $mdMedia, $q, payDialog, userApi, $timeout, $interval, qrcodeDialog, ipDialog) => {
    $scope.setTitle('Account Number');
    $scope.setMenuButton('arrow_back', 'user.account');
    $scope.accountId = +$stateParams.accountId;
    $q.all([
      $http.get(`/api/user/account/${ $scope.accountId }`),
      $http.get('/api/user/server'),
      $http.get('/api/user/setting/account'),
    ]).then(success => {
      console.log('success  ====>>>>>>>>>>>>>>', success)
      $scope.account = success[0].data;
      $scope.servers = success[1].data.map(server => {
        if(server.host.indexOf(':') >= 0) {
          server.host = server.host.split(':')[1];
        }
        return server;
      });
      $scope.getServerPortData($scope.servers[0], $scope.accountId);
      $scope.isMultiServerFlow = success[2].data.multiServerFlow;
    }).catch(err => {
      console.log('serious erro=========>>>>>>>>r', err);
      $state.go('user.account');
    });
    let currentServerId;
    $scope.getServerPortData = (server, accountId) => {
      if (!server) return null
      const serverId = server.id;
      currentServerId = serverId;
      $scope.serverPortFlow = 0;
      $scope.lastConnect = 0;
      userApi.getServerPortData(serverId, accountId).then(success => {
        if (!success) return null
        $scope.serverPortFlow = success.serverPortFlow;
        $scope.lastConnect = success.lastConnect;
        let maxFlow = 0;
        if($scope.account.data) {
          maxFlow = $scope.account.data.flow * ($scope.isMultiServerFlow ? 1 : server.scale);
        }
        server.isFlowOutOfLimit = maxFlow ? ($scope.serverPortFlow >= maxFlow) : false;
      });
      $scope.servers.forEach((server, index) => {
        if(server.id === serverId) { return; }
        $timeout(() => {
          userApi.getServerPortData(serverId, accountId);
        }, index * 1000);
      });
    };
    $scope.setInterval($interval(() => {
      const serverId = currentServerId;
      userApi.getServerPortData(serverId, $scope.accountId).then(success => {
        if (!success) return null
        if(serverId !== currentServerId) { return; }
        $scope.lastConnect = success.lastConnect;
        $scope.serverPortFlow = success.serverPortFlow;
      });
    }, 60 * 1000));
    const base64Encode = str => {
      return btoa(encodeURIComponent(str).replace(/%([0-9A-F]{2})/g, function(match, p1) {
        return String.fromCharCode('0x' + p1);
      }));
    };
    $scope.createQrCode = (method, password, host, port, serverName) => {
      return 'ss://' + base64Encode(method + ':' + password + '@' + host + ':' + port);
    };
    $scope.showQrcodeDialog = (method, password, host, port, serverName) => {
      const ssAddress = $scope.createQrCode(method, password, host, port, serverName);
      qrcodeDialog.show(serverName, ssAddress);
    };
    $scope.editAccount = id => {
      $state.go('user.editAccount', { accountId: id });
    };

    $scope.getQrCodeSize = () => {
      if($mdMedia('xs')) {
        return 230;
      } else if ($mdMedia('lg')) {
        return 240;
      }
      return 180;
    };

    $scope.flowType = {
      value: 'day',
    };
    const flowTime = {
      hour: Date.now(),
      day: Date.now(),
      week: Date.now(),
    };
    const flowLabel = {
      hour: ['0', '', '', '15', '', '', '30', '', '', '45', '', ''],
      day: ['0', '', '', '', '', '', '6', '', '', '', '', '', '12', '', '', '', '', '', '18', '', '', '', '', '', ],
      week: ['S', 'M', 'T', 'W', 'T', 'F', 'S'],
    };
    const scaleLabel = (number) => {
      if(number < 1) {
        return number.toFixed(1) +' B';
      } else if (number < 1000) {
        return number.toFixed(0) +' B';
      } else if (number < 1000000) {
        return (number/1000).toFixed(0) +' KB';
      } else if (number < 1000000000) {
        return (number/1000000).toFixed(0) +' MB';
      } else if (number < 1000000000000) {
        return (number/1000000000).toFixed(1) +' GB';
      } else {
        return number;
      }
    };
    $scope.createOrder = (accountId) => {
      payDialog.chooseOrderType(accountId);
    };
    $scope.changeFlowTime = (serverId, number) => {
      const time = {
        hour: 3600 * 1000,
        day: 24 * 3600 * 1000,
        week: 7 * 24 * 3600 * 1000,
      };
      flowTime[$scope.flowType.value] += number * time[$scope.flowType.value];
    };
    $scope.getChartSize = () => {
      if($mdMedia('xs')) {
        return {
          line: [ 320, 170 ],
          pie: [ 170, 170 ],
        };
      } else if($mdMedia('sm')) {
        return {
          line: [ 360, 190 ],
          pie: [ 190, 190 ],
        };
      } else if($mdMedia('md')) {
        return {
          line: [ 360, 180 ],
          pie: [ 180, 180 ],
        };
      } else if($mdMedia('gt-md')) {
        return {
          line: [ 540, 240 ],
          pie: [ 240, 240 ],
        };
      }
    };
    $scope.fontColor = (time) => {
      if(time >= Date.now()) {
        return {
          color: '#333',
        };
      }
      return {
        color: '#a33',
      };
    };
    $scope.toUserPage = userId => {
      if(!userId) { return; }
      $state.go('user.userPage', { userId });
    };
    $scope.clientIp = (serverId, accountId) => {
      ipDialog.show(serverId, accountId);
    };
    $scope.cycleStyle = account => {
      let percent = 0;
      if(account.type !== 1) {
        percent = ((Date.now() - account.data.from) / (account.data.expire - account.data.from) * 100).toFixed(0);
      }
      console.log('percent ', percent)
      if(percent > 100) {
        percent = 100;
      }
      return {
        background: `linear-gradient(90deg, rgba(0,0,0,0.12) ${ percent }%, rgba(0,0,0,0) 0%)`
      };
    };
  }
])
.controller('UserAddAccountController', ['$scope', '$state', '$stateParams', '$http', '$mdBottomSheet', 'alertDialog',
  ($scope, $state, $stateParams, $http, $mdBottomSheet, alertDialog) => {
    $scope.setTitle('Add an Account');
    $scope.setMenuButton('arrow_back', 'user.account');
    $scope.typeList = [
      {key: 'Unlimited', value: 1},
      {key: 'Weekly', value: 2},
      {key: 'Monthly', value: 3},
      {key: 'Daily', value: 4},
      {key: 'Hourly', value: 5},
    ];
    $scope.timeLimit = {
      '2': 7 * 24 * 3600000,
      '3': 30 * 24 * 3600000,
      '4': 24 * 3600000,
      '5': 3600000,
    };
    $scope.account = {
      time: Date.now(),
      limit: 1,
      flow: 100,
      autoRemove: 0,
    };
    $scope.cancel = () => {
      $state.go('user.account');
    };
    $scope.confirm = () => {
      alertDialog.loading();
      $http.post('/api/user/account', {
        type: +$scope.account.type,
        port: +$scope.account.port,
        password: $scope.account.password,
        time: $scope.account.time,
        limit: +$scope.account.limit,
        flow: +$scope.account.flow * 1000 * 1000,
        autoRemove: $scope.account.autoRemove ? 1 : 0,
      }).then(success => {
        alertDialog.show('Successfully created account', 'OK');
        $state.go('user.account');
      }).catch(() => {
        alertDialog.show('Failed to create account', 'OK');
      });
    };
    $scope.pickTime = () => {
      $mdBottomSheet.show({
        templateUrl: '/public/views/user/pickTime.html',
        preserveScope: true,
        scope: $scope,
      });
    };
    $scope.setStartTime = (number) => {
      $scope.account.time += number;
    };
    $scope.setLimit = (number) => {
      $scope.account.limit += number;
      if($scope.account.limit < 1) {
        $scope.account.limit = 1;
      }
    };
  }
])
.controller('UserEditAccountController', ['$scope', '$state', '$stateParams', '$http', '$mdBottomSheet', 'confirmDialog', 'alertDialog',
  ($scope, $state, $stateParams, $http, $mdBottomSheet, confirmDialog, alertDialog) => {
    $scope.setTitle('Edit Account');
    $scope.setMenuButton('arrow_back', function() {
      $state.go('user.accountPage', { accountId: $stateParams.accountId });
    });
    $scope.typeList = [
      {key: 'Unlimited', value: 1},
      {key: 'Weekly', value: 2},
      {key: 'Monthly', value: 3},
      {key: 'Daily', value: 4},
      {key: 'Hourly', value: 5},
    ];
    $scope.timeLimit = {
      '2': 7 * 24 * 3600000,
      '3': 30 * 24 * 3600000,
      '4': 24 * 3600000,
      '5': 3600000,
    };
    $scope.account = {
      time: Date.now(),
      limit: 1,
      flow: 100,
      autoRemove: 0,
    };
    const accountId = $stateParams.accountId;
    $http.get('/api/user/server').then(success => {
      $scope.servers = success.data;
      return $http.get(`/api/user/account/${ accountId }`);
    }).then(success => {
      $scope.account.type = success.data.type;
      $scope.account.port = success.data.port;
      $scope.account.password = success.data.password;
      $scope.account.autoRemove = success.data.autoRemove;
      if(success.data.type >= 2 && success.data.type <= 5) {
        $scope.account.time = success.data.data.create;
        $scope.account.limit = success.data.data.limit;
        $scope.account.flow = success.data.data.flow / 1000000;
      }
      $scope.account.server = success.data.server;
      $scope.accountServer = !!$scope.account.server;
      $scope.accountServerObj = {};
      if($scope.account.server) {
        $scope.servers.forEach(server => {
          if($scope.account.server.indexOf(server.id) >= 0) {
            $scope.accountServerObj[server.id] = true;
          } else {
            $scope.accountServerObj[server.id] = false;
          }
        });
      }
    });
    $scope.cancel = () => {
      $state.go('user.accountPage', { accountId: $stateParams.accountId });
    };
    $scope.confirm = () => {
      alertDialog.loading();
      const server = Object.keys($scope.accountServerObj)
      .map(m => {
        if($scope.accountServerObj[m]) {
          return +m;
        }
      })
      .filter(f => f);
      $http.put(`/api/user/account/${ accountId }/data`, {
        type: +$scope.account.type,
        port: +$scope.account.port,
        password: $scope.account.password,
        time: $scope.account.time,
        limit: +$scope.account.limit,
        flow: +$scope.account.flow * 1000 * 1000,
        autoRemove: $scope.account.autoRemove ? 1 : 0,
        server: $scope.accountServer ? server : null,
      }).then(success => {
        alertDialog.show('修改账号成功', 'OK');
        $state.go('user.accountPage', { accountId: $stateParams.accountId });
      }).catch(() => {
        alertDialog.show('修改账号失败', 'OK');
      });
    };
    $scope.pickTime = () => {
      $mdBottomSheet.show({
        templateUrl: '/public/views/user/pickTime.html',
        preserveScope: true,
        scope: $scope,
      });
    };
    $scope.setStartTime = (number) => {
      $scope.account.time += number;
    };
    $scope.setStartTimeToCurrentTime = () => {
      $scope.account.time = Date.now();
    };
    $scope.setLimit = (number) => {
      $scope.account.limit += number;
      if($scope.account.limit < 1) {
        $scope.account.limit = 1;
      }
    };
    $scope.deleteAccount = () => {
      confirmDialog.show({
        text: '真的要删除账号吗？',
        cancel: '取消',
        confirm: '删除',
        error: '删除账号失败',
        fn: function () { return $http.delete('/api/user/account/' + accountId); },
      }).then(() => {
        $state.go('user.account');
      });
    };
  }
]);
