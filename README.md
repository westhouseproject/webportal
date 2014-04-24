# Web Portal

This is the main web portal for the project. This allows users to log in and read the home's energy use data, as well as control devices in a house.

## Running the system

Create a new `production.json` file in the settings folder. The JSON data should look like the following:

```json
{
  "database": {
    "database": "<database name>",
    "username": "<MySQL username>",
    "password": "<MySQL password associated with username>",
    "sync": false,
    "forceSync": false
    "sequelizeSettings": {
      "host": "<The end host that has an instance of MySQL running>",
      "port": 3306
    }
  },
  "sessionToken": "<some random gibberish>"
}
```

*Note: change the above `database.sequelizeSettings.port` to the number where your instance of MySQL is running.*
*Note: change the above `database.sync` to true if you want to create tables that don't yet exist.*
*Note: `database.forceSync` will only ever be taken into consideration of `database.sync` has been set to true.*