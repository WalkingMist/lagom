---
layout: post
title: Setting up my first Kubernetes cluster - Part 1
categories:
- blog
---

Recently, I tried to setup a CI / CD (Continuous Integration / Continuous Delivery) pipeline for some of the projects I am working on. I have been using my own GitLab instance hosted on my trusted home server for the past couple of years. Therefore, I am eager to setup the pipeline using GitLab CI, the official GitLab CI / CD extension to their code repository. As I look into GitLab CI, Kubernetes is being presented as the default platform on which most of the automations are being delivered.

This series of articles records my journey in setting up my first Kubernetes cluster. I hope that at the end of this series you will be able to:

* Using Hyper-V to setup the basic infrastructure for the cluster
* Preparing the Virtual Machines (VM) as Kubernetes nodes (master and worker)
* Initialise the cluster on Master node via ```kubeadm``` tool
* Initialise and join the worker nodes to the cluster via ```kubeadm``` tool
* Install cluster networking
* Install cluster storage

I will update and expand the series as I come across new areas during my pursue of the CI / CD pipeline. There will also be a seperate series of articles about on setting up GitLab CI.

---

## Hardware Setup

Let's have a look at the hardware in which all of these will be running on:

CPU | AMD FX 8-core Black Edition FX-8320
Motherboard | Asrock 970 Extreme4
RAM | Klevv Neo 32GB (4 x 8GB) DDR3 RAM 2400 11-13-13
GPU | Inno3D GeForce GTX 1060 3GB Compact
Storage | ADATA SP600 256GB SSD
 | Seagate Baracuda 4TB 7200RPM SATA III HDD
PSU | Corsair HX850 850W 80+ Platinum Certified Fully Modular PSU

This configuration support Hyper-V by providing:

* 64-bit processors with Second Level Address Translation (SLAT)
* Virtualisation extensions (VT-x and VT-d on Intel Platform, AMD-V and AMD-Vi on AMD Platform)
* Minium of 4GB memory

This setup is my daily driver for the last few years, I use it for development and some casual gaming. It was originally the main server in a VMWare Home Lab which allow multiple GPU(s) to pass through to VM(s) via 4 on board PCIe x16 slots. However, I gave my Intel Core i5 machine (my previous main machine) to my brother as his pc died. So this PC has become my main machine.


## Software Setup

The host OS is Windows 10 Pro with Hyper-V feature turned on, so that I can spin up multiple VM(s) to form the cluster.

> From Microsoft documentation, only Windows 10 Enterprise, Pro and Education editions have Hyper-V built-in and needs to be enabled before we can work with VM(s). 

> For Home edition users the only way to activate Hyper-V feature is a paid upgrade from Home to Pro or Enterprise edition through the online program. However, there are additional purchases involved. 

> Since Hyper-V is built-into Windows, there are no package for download and install. 

To activate the Hyper-V feature please refer to [Official Documentation](https://docs.microsoft.com/en-us/virtualization/hyper-v-on-windows/quick-start/enable-hyper-v "Install Hyper-V on Windows 10").

I have partitioned my physical storage as follows:

C: | 256GB @ ADATA SSD - Windows 10 Pro 
D: | 128GB @ Seagate HDD - Virtual Machine storage
E: | 128GB @ Seagate HDD - User Home Directories
F: | 3.7TB @ Seagate HDD - General storage

## Hyper V Setup 

I started out using the **Hyper-V Manager** desktop app to configure the hypervisor and to manage the VM(s). However, during the numerous trial and error attemps I decided to invest some effort into learning PowerShell scripting to automate tear-down and rebuilding of the VM(s).

### Virtual Switch

Upon successfully installing Hyper-V, a default virtual switch will be added to the Hyper-V network. However, this virtual switch can only support inter-VM networking, it does not allow VM(s) to reach the host network and beyond.

Therefore, we need to add a new virtual switch and configure it to bridge between the VM network and host network.

First, open up **Hyper-V Manager**, right click on your local machine and select **Virtual Switch Manager** from the drop down menu.

![Open Virutal Switch Manager](/assets/img/20181228_001.png)

Then, from the top-left, select **New virtual network switch** and select the correct type of connectivity you would like your switch to provide. In this case we would like to let the VM(s) to have access to host network and the internet, therefore, I have selected **External** from the list. After that click on the **Create Virtual Switch** button.

![Create External Network Switch](/assets/img/20181228_002.png)

Finally, we need to give this switch a friendly name and select the correct physical NIC (Network Interface Controller) if you have multiple NIC(s) installed. Here, I only have one NIC installed and that's the onboard Realtek GbE connection.

After you have checked and confirmed all the settings then click on the **Apply** button to complete the setup.

You can also create more network switches with different settings to further define your networking environments to support your objectives.

Below is the equivalent PowerShell script for adding a Virtual Switch:

{% highlight powershell %}
Import-Module Hyper-V

$nic = Get-NetAdapter -Name "Ethernet"

New-VMSwitch -Name "External Switch" -NetAdapterName $nic.name -AllowManagementOS $true
{% endhighlight %}

### Differencing Disk

Since the VM(s) will share the OS, Docker and someother basic package installations and configurations, there is no need to have individual copies of the base OS image. I can consolidate these into a read-only parent disk and have the VM(s) write their differences in its own child disk. It will help lessen the workload on manual VM creation and demands on storage spaces. However, since the parent disk will still be ised by all the sharing VM(s), it is suggested that the parent disk be put onto a fast storage system, such as SSD, and marked as read-only.

To begin, I span up a VM to install and configure the base OS and prepare the way for Kubernetes. The guest OS is going to be Ubuntu Server 18.04.1 LTS, other OSes should also works, but I am more familiar with Ubuntu and the installation footprint is quite small. I started with the following configurations:

Generation | Generation 2
vCPU | 2 cores
RAM | 2048MB static allocation
HDD | 20GB on virtual SCSI controller
 | DVD with Ubuntu server installation media (ISO) mounted
Secure Boot | Disabled
Networking | External Switch with internet access
Checkpoint | Disabled

Install Ubuntu server by following the on screen instructions, when prompted to select additional packages to be installed, just make sure **SSH Server** is checked. Otherwise, you will not be able to work with the server remotely via Secured Shell (SSH) later.

Once you can "SSH" into the server, execute the following command

{% highlight bash %}
sudo apt update && sudo apt -y upgrade
{% endhighlight %}

to update the OS.

While the system is busy updating, I opened up another SSH session and switch off the swap and umount the swap partition:

{% highlight bash %}
sudo swapoff -a
{% endhighlight %}

Edit the file **/etc/fstab** and comment out the line that will mount the swap partition on system startup

{% highlight bash %}
#/swap.img none swap sw 0 0
{% endhighlight %}

to make sure the swap space will not be mounted after reboot. Just one more area of Ubuntu needs to be configured before we can start installing Kubernetes and friends.

Ubuntu has packaged their server platform to be cloud-ready via the new package **cloud-init**. This package will do some housekeeping during system startup and will run some other tasks periodically, such as **Auto-Update**. While it is nice to have devices updating itself, I just wanted my environment to be stable and constant. Also, I need to assign different hostname and static IP to the cluster machines as I don't want the complexity of setting up DHCP and DNS servers and I found out that for some reason the housekeeping done by **cloud-init** will revert my changes made to the individual VM(s). Therefore, **cloud-init** has to go.

{% highlight bash %}
echo "Configuring ubuntu server"
sed -i 's/APT::Periodic::Update-Package-Lists "1"/APT::Periodic::Update-Package-Lists "0"/' /etc/apt/apt/conf.d/20-auto-upgrades
systemctl disable --now apt-daily{,-upgrade}.{timer,service}
echo 'datasource_list: [ None ]' | tee /etc/cloud/cloud.cfg.d/90_dpkg.cfg
apt purge cloud-init
rm -rf /etc/cloud; rm -rf /var/lib/cloud/
{% endhighlight %}

In the script above, I switch off the **auto update** first, as the system might try to start a run while I am typing out the script. Next, it disable and remove all the system services that are related to **auto update**. And finally I purge the package and it's related contents from the system. 

When the update has finished, reboot the VM. 

Next, I installed Kubernetes tools and other dependencies, such as Docker CE. Docker is one of the container providers for Kubernetes, there are other compatible container provider that Kubernetes can take advantage of. However, I have worked with Docker before and I am happy with it. 

{% highlight bash %}
echo "Installing Docker CE"
apt install -y apt-transport-https ca-certificates curl software-properties-common
curl -fsSL https://download.docker.com/linux/ubuntu/gpg | apt-key add -
add-apt-repository \
   "deb [arch=amd64] https://download.docker.com/linux/ubuntu \
   $(lsb_release -cs) \
   stable"
apt update
apt intall -y docker-ce=$(apt-cache madison docker-ce | grep 18.03 | head -1 | awk '{print $3}')

echo "Installing Kubernetes
curl -s https://packages.cloud.google.com/apt/doc/apt-key.gpg | apt-key add -
cat <<EOF >/etc/apt/sources.list.d/kubernetes.list
deb http://apt.kubernetes.io/ kubernetes-xenial main
EOF
apt update
apt install -y kubelet kubeadm kubectl
{% endhighlight %}

After Kubernetes tools has been successfully installed onto the base image, it is time to shutdown this VM as the base image is now ready. After shutdown, make the virtual harddisk image file **READ ONLY**. This is important as you don't want multiple dependent VM(s) trying to merge their changes back to the base image. When all the dust are settled, we can move onto creating the actual cluster nodes.

### Using PowerShell to automatically build VM(s)

For my first cluster, I created a total of 3 VM(s), one master node and 2 worker nodes. I have the following PowerShell script to create the whole setup, however, it is also doable via the Hyper-V Manager app.

{% highlight powershell %}
# Create all the differencing disks
New-VHD -Path "D:\Virtual Hard Disks\KubeMaster.vhdx" -ParentPath "C:\KubeNodeBase.vhdx" -Differencing -PhysicalSectorSizeBytes 4096
New-VHD -Path "D:\Virtual Hard Disks\KubeNode01.vhdx" -ParentPath "C:\KubeNodeBase.vhdx" -Differencing -PhysicalSectorSizeBytes 4096
New-VHD -Path "D:\Virtual Hard Disks\KubeNode02.vhdx" -ParentPath "C:\KubeNodeBase.vhdx" -Differencing -PhysicalSectorSizeBytes 4096

# Create the virtual machines
Write-Host "Creating Virtual Machines for the cluster..."
New-VM -Name "KubeMaster" -MemoryStartupBytes 2048MB -Generation 2 -NoVHD -SwitchName "ExternalNetwork"
New-VM -Name "KubeNode01" -MemoryStartupBytes 1024MB -Generation 2 -NoVHD -SwitchName "ExternalNetwork"
New-VM -Name "KubeNode02" -MemoryStartupBytes 1024MB -Generation 2 -NoVHD -SwitchName "ExternalNetwork"

# Reconfigure the virtual machines from their defaults
Write-Host "Reconfiguring VM(s)..."
$vmHardDisk = Get-VMHardDiskDrive -VMName "KubeMaster"
Set-VM -Name "KubeMaster" -ProcessorCount 4 -StaticMemory -CheckpointType Disabled
Set-VMFirmware -VMName "KubeMaster" -EnableSecureBoot Off -FirstBootDevice $vmHardDisk
$vmHardDisk = Get-VMHardDiskDrive -VMName "KubeNode01"
Set-VM -Name "KubeNode01" -ProcessorCount 2 -StaticMemory -CheckpointType Disabled
Set-VMFirmware -VMName "KubeNode01" -EnableSecureBoot Off -FirstBootDevice $vmHardDisk
$vmHardDisk = Get-VMHardDiskDrive -VMName "KubeNode02"
Set-VM -Name "KubeNode02" -ProcessorCount 2 -StaticMemory -CheckpointType Disabled
Set-VMFirmware -VMName "KubeNode02" -EnableSecureBoot Off -FirstBootDevice $vmHardDisk

Write-Host "Finished generating the cluster, please verify the configurations in Hyper V Manager"

{% endhighlight %}

First, copy and paste the above script into a new file then save it. I saved mine as **create-cluster.ps1**. Then start the PowerShell with Administrator permission. Most of the Hyper-V related cmdlet(s) requires Administrative rights to work correctly. Once you have a PowerShell window, find the script and execute it.

{% highlight powershell %}
create-cluster.ps1
{% endhighlight %}

After the script has ran it's course, you can verify the results with the Hyper V Manager and you should see the following:

![Verify 3 VM(s) created by PS script](/assets/img/20181228_004.png)

As you can see there are three VM(s) created, "KubeMaster", "KubeNode01" and "KubeNode02". If you right click on anyone of them to check on their configurations, you should see something similar as below:

![General VM Settings](/assets/img/20181228_005.png)

"Secure Boot" has been disabled, memory has been set to 2048MB (for Master) or 1024MB (for Worker), 4 (for Master) or 2 (for Worker) virtual processors, hard disk drive has been attached on a SCSI controller, network adapter has been hooked up with "ExternalNetwork" virtual switch and finally "Checkpoints" has been disabled.

To check the static memory allocation, right click on the Memory section to bring up the property sheet. You will find that **Dynamic Memory** has been disabled and the amount of memory has been set at 2048MB for Master or 1024MB for Worker nodes.

![Memory Settings](/assets/img/20181228_006.png)

## Conclusion

As the last section concludes this part of the setup, lets look at where we stands in the list of things that needs to be done:

- [x] Using Hyper-V to setup the basic infrastructure for the cluster
- [x] Preparing the virtual machines as Kubernetes nodes (Master and Worker)
- [ ] Initialised the cluster on Master VM via ```kubeadm``` tool
- [ ] Join the Worker nodes to the cluster via ```kubeadm``` tool
- [ ] Install cluster networking
- [ ] Setup cluster storage

Now, I have a working set of VM(s) that have been prepared for Kubernetes installation. The steps can also be adapted to physical nodes instead of VM(s).

Next time, we will have a look at initialising the Kubernetes Master and Worker nodes. Then we will join the nodes together into a cluster.

---