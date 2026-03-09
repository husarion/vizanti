import '../lib/roslib.min.js';

// MissionRecorder class for interacting with mission_recorder.py ROS 2 node
class MissionRecorder {
  constructor(ros, node_name = "") {
    this.ros = ros;
    this.node_name = node_name;
  }

  setNodeName(node_name) {
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

  async overrideMission(info, poses) {
    let overrideMissionClient = new ROSLIB.Service({
      ros: this.ros,
      name: `${this.node_name}/override_mission`,
      serviceType: "husarion_outdoor_nav_msgs/srv/OverrideMission"
    });

    const request = new ROSLIB.ServiceRequest({
      info: info,
      poses: poses
    });

    return new Promise((resolve, reject) => {
      overrideMissionClient.callService(request, resolve, reject);
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

class MissionWindow {
  constructor(windowElement, dragElement, endDragCallback) {
    this.missionWindowElement = windowElement;
    this.dragElement = dragElement;
    this.endDragCallback = endDragCallback;
    this.position = null;

    // Dragging functionality
    let isDragging = false;
    let offsetX, offsetY;

    this.dragElement.addEventListener("mousedown", (e) => {
      isDragging = true;
      offsetX = e.clientX - this.missionWindowElement.getBoundingClientRect().left;
      offsetY = e.clientY - this.missionWindowElement.getBoundingClientRect().top;
      document.body.style.userSelect = "none";
    });

    document.addEventListener("mousemove", (e) => {
      if (isDragging) {
        const position = {
          left: `${e.clientX - offsetX}px`,
          top: `${e.clientY - offsetY}px`
        };
        this.setPosition(position);
      }
    });

    document.addEventListener("mouseup", () => {
      isDragging = false;
      document.body.style.userSelect = ""; // Re-enable text selection
      this.endDragCallback();
    });
  }

  show() {
    this.missionWindowElement.style.display = "block";
  }

  hide() {
    this.missionWindowElement.style.display = "none";
  }

  isActive() {
    return this.missionWindowElement.style.display === "block";
  }

  getPosition() {
    if (!this.position) {
      this.position = {
        left: "50%",
        top: "50%",
        transform: "translate(-50%, -50%)"
      };
    }
    return this.position;
  }

  setPosition(position) {
    this.position = position;
    this.missionWindowElement.style.transform = position.transform || "translate(0, 0)";
    this.missionWindowElement.style.left = position.left || "0";
    this.missionWindowElement.style.top = position.top || "0";
  }
}

export { MissionRecorder, MissionWindow };
