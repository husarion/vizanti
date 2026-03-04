import '../lib/roslib.min.js';

// MissionRecorder class for interacting with mission_recorder.py ROS 2 node
class MissionRecorder {
  constructor(ros, node_name = "") {
    this.ros = ros;
    this.node_name = node_name;
  }

  async setDoubleParameters(params) {
    let setParamClient = new ROSLIB.Service({
      ros: this.ros,
      name: `${this.node_name}/set_parameters`,
      serviceType: "rcl_interfaces/srv/SetParameters"
    });

    const parameters = params.map(param => ({
      name: param.name,
      value: {
        type: 3, // 3 for double
        double_value: param.value
      }
    }));

    const request = new ROSLIB.ServiceRequest({
      parameters: parameters
    });

    return new Promise((resolve, reject) => {
      setParamClient.callService(request, resolve, reject);
    });
  }

  async startRecording(feedbackCallback) {
    let startRecordingClient = new ROSLIB.Service({
      ros: this.ros,
      name: `${this.node_name}/start_recording`,
      serviceType: "std_srvs/srv/Trigger"
    });

    let feedbackTopic = new ROSLIB.Topic({
      ros: this.ros,
      name: `${this.node_name}/recorded_poses`,
      messageType: "geometry_msgs/msg/PoseArray"
    });
    feedbackTopic.subscribe((message) => {
      feedbackCallback(message);
    });

    return new Promise((resolve, reject) => {
      startRecordingClient.callService({}, resolve, reject);
    });
  }

  async stopRecording() {
    let stopRecordingClient = new ROSLIB.Service({
      ros: this.ros,
      name: `${this.node_name}/stop_recording`,
      serviceType: "std_srvs/srv/Trigger"
    });

    return new Promise((resolve, reject) => {
      stopRecordingClient.callService({}, resolve, reject);
    });
  }

  async pauseRecording() {
    let pauseRecordingClient = new ROSLIB.Service({
      ros: this.ros,
      name: `${this.node_name}/pause_recording`,
      serviceType: "std_srvs/srv/Trigger"
    });

    return new Promise((resolve, reject) => {
      pauseRecordingClient.callService({}, resolve, reject);
    });
  }

  async resumeRecording() {
    let resumeRecordingClient = new ROSLIB.Service({
      ros: this.ros,
      name: `${this.node_name}/resume_recording`,
      serviceType: "std_srvs/srv/Trigger"
    });

    return new Promise((resolve, reject) => {
      resumeRecordingClient.callService({}, resolve, reject);
    });
  }

  async listMissions() {
    let listMissionsClient = new ROSLIB.Service({
      ros: this.ros,
      name: `${this.node_name}/list_missions`,
      serviceType: "husarion_outdoor_nav_msgs/srv/ListMissions"
    });

    return new Promise((resolve, reject) => {
      listMissionsClient.callService({}, resolve, reject);
    });
  }

  async getMission(id) {
    let getMissionClient = new ROSLIB.Service({
      ros: this.ros,
      name: `${this.node_name}/get_mission`,
      serviceType: "husarion_outdoor_nav_msgs/srv/GetMission"
    });

    const request = new ROSLIB.ServiceRequest({
      id: id
    });

    return new Promise((resolve, reject) => {
      getMissionClient.callService(request, resolve, reject);
    });
  }

  async updateMission(info, poses) {
    let updateMissionClient = new ROSLIB.Service({
      ros: this.ros,
      name: `${this.node_name}/update_mission`,
      serviceType: "husarion_outdoor_nav_msgs/srv/UpdateMission"
    });

    const request = new ROSLIB.ServiceRequest({
      info: info,
      poses: poses
    });

    return new Promise((resolve, reject) => {
      updateMissionClient.callService(request, resolve, reject);
    });
  }

  async deleteMission(id) {
    let deleteMissionClient = new ROSLIB.Service({
      ros: this.ros,
      name: `${this.node_name}/delete_mission`,
      serviceType: "husarion_outdoor_nav_msgs/srv/DeleteMission"
    });

    const request = new ROSLIB.ServiceRequest({
      id: id
    });

    return new Promise((resolve, reject) => {
      deleteMissionClient.callService(request, resolve, reject);
    });
  }

  async clearMissions() {
    let clearMissionsClient = new ROSLIB.Service({
      ros: this.ros,
      name: `${this.node_name}/clear_missions`,
      serviceType: "std_srvs/srv/Trigger"
    });

    return new Promise((resolve, reject) => {
      clearMissionsClient.callService({}, resolve, reject);
    });
  }
}

export { MissionRecorder };
